import 'server-only'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { hmacFor } from './crypto'

/**
 * ThaID (DOPA) OpenID Connect, authorization code flow.
 *
 * Env:
 *   THAID_CLIENT_ID, THAID_CLIENT_SECRET  from the DOPA RP registration
 *   THAID_REDIRECT_URI                    registered callback, e.g. https://wifi.tsm.go.th/thaid/callback
 *   THAID_ISSUER                          default production; sandbox is https://imauthsbx.bora.dopa.go.th
 *   THAID_SCOPE                           default "openid pid name" — only what a registration needs
 *   THAID_API_KEY + THAID_API_KEY_HEADER  only if DOPA's integration doc asks for an API key header
 *
 * Without THAID_CLIENT_ID the ThaID button is hidden and the routes refuse.
 */

const DEFAULT_ISSUER = 'https://imauth.bora.dopa.go.th'
const STATE_TTL_MS = 10 * 60_000
const STATE_PURPOSE = 'thaid-state-v1'

export function thaidEnabled(): boolean {
  return Boolean(process.env.THAID_CLIENT_ID)
}

function config() {
  const clientId = process.env.THAID_CLIENT_ID
  const clientSecret = process.env.THAID_CLIENT_SECRET
  const redirectUri = process.env.THAID_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('THAID_CLIENT_ID, THAID_CLIENT_SECRET and THAID_REDIRECT_URI must be set')
  }
  return {
    issuer: (process.env.THAID_ISSUER || DEFAULT_ISSUER).replace(/\/+$/, ''),
    clientId,
    clientSecret,
    redirectUri,
    scope: process.env.THAID_SCOPE || 'openid pid name',
  }
}

function apiKeyHeaders(): Record<string, string> {
  const key = process.env.THAID_API_KEY
  const header = process.env.THAID_API_KEY_HEADER
  return key && header ? { [header]: key } : {}
}

type Discovery = {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint?: string
}

let discovery: Promise<Discovery> | undefined

/** Endpoints from the issuer's discovery document, fetched once per process */
function getDiscovery(issuer: string): Promise<Discovery> {
  discovery ??= fetch(`${issuer}/.well-known/openid-configuration`, { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) throw new Error(`ThaID discovery ${res.status}`)
      return (await res.json()) as Discovery
    })
    .catch((err) => {
      discovery = undefined // retry on the next request
      throw err
    })
  return discovery
}

// --- state ---------------------------------------------------------------
//
// The device's MAC/IP ride in a signed state instead of a cookie: after the
// ThaID app approves, the callback may open in a different browser than the
// captive-portal sheet that started the login (Safari/Chrome instead of the
// CNA), so nothing set in the first browser can be relied on.

export type ThaidState = { mac: string; ip: string | null; nonce: string }

export function createState(mac: string, ip: string | null): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({ m: mac, i: ip, n: nonce, e: Date.now() + STATE_TTL_MS }),
  ).toString('base64url')
  const sig = hmacFor(STATE_PURPOSE, payload).toString('base64url')
  return { state: `${payload}.${sig}`, nonce }
}

export function readState(state: string): ThaidState | null {
  const [payload, sig] = state.split('.')
  if (!payload || !sig) return null
  const expected = hmacFor(STATE_PURPOSE, payload)
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const { m, i, n, e } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof m !== 'string' || typeof n !== 'string' || typeof e !== 'number') return null
    if (Date.now() > e) return null
    return { mac: m, ip: typeof i === 'string' ? i : null, nonce: n }
  } catch {
    return null
  }
}

// --- flow ----------------------------------------------------------------

export async function authorizeUrl(state: string, nonce: string): Promise<string> {
  const cfg = config()
  const { authorization_endpoint } = await getDiscovery(cfg.issuer)
  const url = new URL(authorization_endpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', cfg.clientId)
  url.searchParams.set('redirect_uri', cfg.redirectUri)
  url.searchParams.set('scope', cfg.scope)
  url.searchParams.set('state', state)
  url.searchParams.set('nonce', nonce)
  return url.toString()
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split('.')[1]
  if (!part) throw new Error('Malformed id_token')
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
}

/**
 * The id_token comes straight from the token endpoint over TLS, authenticated
 * with our client secret, so its signature isn't checked (OIDC Core 3.1.3.7
 * item 6) — only that it was issued for us, now, for this login.
 */
function checkIdToken(claims: Record<string, unknown>, issuer: string, clientId: string, nonce: string) {
  const aud = claims.aud
  const audOk = aud === clientId || (Array.isArray(aud) && aud.includes(clientId))
  if (claims.iss !== issuer) throw new Error(`id_token iss ${String(claims.iss)}`)
  if (!audOk) throw new Error('id_token aud mismatch')
  if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) throw new Error('id_token expired')
  if (claims.nonce !== undefined && claims.nonce !== nonce) throw new Error('id_token nonce mismatch')
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Exchange the callback code for the verified citizen ID and name */
export async function exchangeCode(code: string, nonce: string): Promise<{ pid: string; name: string }> {
  const cfg = config()
  const d = await getDiscovery(cfg.issuer)

  const res = await fetch(d.token_endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...apiKeyHeaders(),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: cfg.redirectUri,
    }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`ThaID token ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const token = (await res.json()) as Record<string, unknown>

  // Claims may come in the id_token, at the top level of the token response,
  // or only from userinfo — take them from wherever they are
  let claims: Record<string, unknown> = { ...token }
  if (typeof token.id_token === 'string') {
    const idClaims = decodeJwtPayload(token.id_token)
    checkIdToken(idClaims, d.issuer, cfg.clientId, nonce)
    claims = { ...claims, ...idClaims }
  }
  if (!str(claims.pid) && d.userinfo_endpoint && typeof token.access_token === 'string') {
    const info = await fetch(d.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${token.access_token}`, ...apiKeyHeaders() },
      cache: 'no-store',
    })
    if (!info.ok) throw new Error(`ThaID userinfo ${info.status}`)
    claims = { ...claims, ...((await info.json()) as Record<string, unknown>) }
  }

  const pid = str(claims.pid).replace(/\D/g, '')
  const name =
    str(claims.name) ||
    [str(claims.given_name), str(claims.middle_name), str(claims.family_name)].filter(Boolean).join(' ')
  if (!pid) throw new Error('ThaID returned no pid')
  return { pid, name: name.slice(0, 200) }
}
