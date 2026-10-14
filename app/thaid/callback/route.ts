import type { NextRequest } from 'next/server'
import isValidThaiID from 'thai-id-validator'
import { registerDevice } from '@/lib/registration'
import { exchangeCode, readState } from '@/lib/thaid'

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } })
}

/** DOPA → here with ?code&state (or ?error when the person cancels) */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const state = readState(params.get('state') ?? '')
  if (!state) return redirect('/?thaid_error=failed')

  const back = (error: 'failed' | 'quota') =>
    redirect(`/?${new URLSearchParams({ client_mac: state.mac, thaid_error: error })}`)

  const code = params.get('code')
  if (!code) return back('failed')

  try {
    const person = await exchangeCode(code, state.nonce)
    if (!isValidThaiID(person.pid)) throw new Error('ThaID pid failed checksum')

    const res = await registerDevice({
      authMethod: 'thaid',
      fullName: person.name || 'ThaID',
      docType: 'thai_id',
      docNumber: person.pid,
      phone: null,
      mac: state.mac,
      ip: state.ip,
    })
    if (!res.ok) return back('quota')

    // Straight to the EG: this browser is on the same device (same MAC)
    return redirect(res.loginUrl)
  } catch (err) {
    console.error('thaid callback failed', err)
    return back('failed')
  }
}
