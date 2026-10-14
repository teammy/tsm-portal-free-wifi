import 'server-only'
import { randomBytes } from 'node:crypto'
import { db } from './db'
import { nextBangkokMidnight, RADIUS_GROUP } from './quota'

const IDLE_SECONDS = 1800

function toRadiusExpiration(d: Date): string {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())} ${m[d.getMonth()]} ${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/**
 * AA-BB-CC-DD-EE-FF → regex for the `=~` check item, so the MAC matches
 * whatever Calling-Station-Id format the EG sends (AA-BB-.., aa:bb:..,
 * aabb.ccdd.eeff, aabbccddeeff). Spelled out as [aA] instead of (?i) because
 * FreeRADIUS may be built with POSIX regex rather than PCRE.
 */
function callingStationIdPattern(mac: string): string {
  const octets = mac.split('-').map((o) =>
    o.replace(/[A-F]/g, (c) => `[${c.toLowerCase()}${c}]`),
  )
  return `^${octets.join('[-:.]?')}$`
}

export async function createSession(input: {
  authMethod: 'thaid' | 'form'
  fullName: string
  docType: 'thai_id' | 'passport' | 'pink_card' | 'other'
  docNumberEnc: Buffer          // เข้ารหัสมาแล้วจาก lib/crypto
  docNumberHmac: Buffer         // hashDocNumber — ใช้จับคนเดียวกันข้าม username
  docLast4: string | null
  phone: string | null
  mac: string                   // AA-BB-CC-DD-EE-FF (normalizeMac ใน app/actions)
  ip: string | null
  consentVersion: string
  // Ceiling for one session. The per-person daily cap across sessions is
  // enforced by the daily_person sqlcounter (Max-Daily-Person-Session on
  // RADIUS_GROUP), which only ever lowers Session-Timeout.
  sessionTimeoutSeconds: number
}) {
  const username = `s-${randomBytes(4).toString('hex')}`
  const password = randomBytes(18).toString('base64url')
  const expiresAt = nextBangkokMidnight()

  await db.transaction().execute(async (trx) => {
    await trx.insertInto('registrations').values({
      session_username: username,
      auth_method: input.authMethod,
      full_name: input.fullName,
      doc_type: input.docType,
      doc_number_enc: input.docNumberEnc,
      doc_number_hmac: input.docNumberHmac,
      doc_last4: input.docLast4,
      phone: input.phone,
      mac: input.mac,
      ip: input.ip,
      consent_version: input.consentVersion,
      consent_at: new Date(),
      expires_at: expiresAt,
    }).execute()

    await trx.insertInto('radcheck').values([
      { username, attribute: 'Cleartext-Password', op: ':=', value: password },
      { username, attribute: 'Expiration',         op: ':=', value: toRadiusExpiration(expiresAt) },
      { username, attribute: 'Calling-Station-Id', op: '=~', value: callingStationIdPattern(input.mac) },
      { username, attribute: 'Simultaneous-Use',   op: ':=', value: '1' },
    ]).execute()

    await trx.insertInto('radreply').values([
      { username, attribute: 'Session-Timeout', op: ':=', value: String(input.sessionTimeoutSeconds) },
      { username, attribute: 'Idle-Timeout',    op: ':=', value: String(IDLE_SECONDS) },
    ]).execute()

    await trx.insertInto('radusergroup').values({
      username, groupname: RADIUS_GROUP, priority: 1,
    }).execute()
  })

  // คืน credential ให้ browser ของเครื่องนั้นนำไปล็อกอินที่ EG (lib/gateway) — ไม่แสดงบนหน้าจอ
  return { username, password, expiresAt }
}