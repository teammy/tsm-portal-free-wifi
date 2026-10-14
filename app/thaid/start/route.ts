import type { NextRequest } from 'next/server'
import { normalizeMac } from '@/lib/mac'
import { authorizeUrl, createState, thaidEnabled } from '@/lib/thaid'

/** Relative Location: behind Caddy, the request URL's host isn't the public one */
function redirect(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } })
}

/** Portal "ลงทะเบียนด้วย ThaID" button → DOPA login */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const mac = normalizeMac(params.get('mac') ?? '')
  const ip = params.get('ip')?.trim() || null

  // Consent is ticked on the portal before leaving for DOPA; the button sends it
  if (!mac || params.get('consent') !== '1' || !thaidEnabled()) {
    return redirect(`/?${new URLSearchParams({ client_mac: params.get('mac') ?? '', thaid_error: 'failed' })}`)
  }

  try {
    const { state, nonce } = createState(mac, ip)
    return redirect(await authorizeUrl(state, nonce))
  } catch (err) {
    console.error('thaid start failed', err)
    return redirect(`/?${new URLSearchParams({ client_mac: mac, thaid_error: 'failed' })}`)
  }
}
