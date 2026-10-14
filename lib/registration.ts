import 'server-only'
import { encryptDocNumber, hashDocNumber, last4 } from './crypto'
import { gatewayLoginUrl } from './gateway'
import { findTodaySession, nextBangkokMidnight, quotaToday } from './quota'
import { createSession } from './session'

/** Version of the terms the person ticked; stored with every registration */
export const CONSENT_VERSION = 'v1'

export type RegisterResult =
  | { ok: true; loginUrl: string; remainingSeconds: number; expiresAt: Date }
  | { ok: false; exhaustedLimitSeconds: number }

/**
 * Shared by the form and ThaID: check today's quota, reuse today's username
 * for this person on this device, or create one — then hand back the EG login
 * URL for the browser to open.
 */
export async function registerDevice(input: {
  authMethod: 'thaid' | 'form'
  fullName: string
  docType: 'thai_id' | 'passport' | 'pink_card' | 'other'
  docNumber: string             // normalizeDocNumber'd plaintext — encrypted here
  phone: string | null
  mac: string                   // AA-BB-CC-DD-EE-FF (lib/mac)
  ip: string | null
}): Promise<RegisterResult> {
  const docNumberHmac = hashDocNumber(input.docNumber)

  // RADIUS would reject this person anyway; say why instead of letting the EG
  // show its generic error
  const quota = await quotaToday({ mac: input.mac, hmac: docNumberHmac })
  if (quota.remainingSeconds <= 0) {
    return { ok: false, exhaustedLimitSeconds: quota.limitSeconds }
  }

  // Same person on the same device again today: log in with the username
  // they already have instead of piling up registrations
  const session =
    (await findTodaySession(input.mac, docNumberHmac)) ??
    (await createSession({
      authMethod: input.authMethod,
      fullName: input.fullName,
      docType: input.docType,
      docNumberEnc: encryptDocNumber(input.docNumber),
      docNumberHmac,
      docLast4: last4(input.docNumber),
      phone: input.phone,
      mac: input.mac,
      ip: input.ip,
      consentVersion: CONSENT_VERSION,
      sessionTimeoutSeconds: quota.limitSeconds,
    }))

  // The browser has to log in at the EG itself (see lib/gateway). Handing it
  // the credentials is fine: they're random per registration, only accepted
  // from this MAC, one device at a time, and expire with the session.
  return {
    ok: true,
    loginUrl: gatewayLoginUrl(session.username, session.password),
    remainingSeconds: quota.remainingSeconds,
    expiresAt: nextBangkokMidnight(),
  }
}
