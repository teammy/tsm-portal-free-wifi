'use server'
import isValidThaiID from 'thai-id-validator'
import { encryptDocNumber, hashDocNumber, last4, normalizeDocNumber } from '@/lib/crypto'
import { gatewayLoginUrl } from '@/lib/gateway'
import { normalizeMac } from '@/lib/mac'
import { findTodaySession, nextBangkokMidnight, quotaToday } from '@/lib/quota'
import { createSession } from '@/lib/session'

const CONSENT_VERSION = 'v1'
const DOC_TYPES = ['thai_id', 'passport', 'pink_card', 'other'] as const
type DocType = (typeof DOC_TYPES)[number]

type Field = 'fullName' | 'docType' | 'docNumber' | 'phone' | 'consent'

export type RegisterState = {
  ok: boolean
  message?: string
  errors?: Partial<Record<Field, string>>
  expiresAt?: string
  /** EG ext_login URL carrying this device's session credentials */
  loginUrl?: string
  /** Time left today for this person, as of registering */
  remainingSeconds?: number
  /** Set when the person has used up today's limit; the form shows that instead */
  exhaustedLimitSeconds?: number
}

function validateDocNumber(type: DocType, doc: string): string | undefined {
  switch (type) {
    case 'thai_id':
      return isValidThaiID(doc) ? undefined : 'เลขบัตรประชาชนไม่ถูกต้อง'
    case 'pink_card':
      return /^\d{13}$/.test(doc) ? undefined : 'เลขบัตรต้องเป็นตัวเลข 13 หลัก'
    case 'passport':
      return /^[A-Z0-9]{6,12}$/.test(doc) ? undefined : 'เลขหนังสือเดินทางไม่ถูกต้อง'
    case 'other':
      return /^[A-Z0-9]{4,30}$/.test(doc) ? undefined : 'เลขเอกสารไม่ถูกต้อง'
  }
}

export type RegisterInput = {
  fullName: string
  docType: string
  docNumber: string
  phone?: string
  consent: boolean
  mac: string
  ip: string
}

export async function register(input: RegisterInput): Promise<RegisterState> {
  // Server Action args come straight from the client — coerce everything
  const fullName = String(input?.fullName ?? '').trim().replace(/\s+/g, ' ')
  const docTypeRaw = String(input?.docType ?? '')
  const docNumber = normalizeDocNumber(String(input?.docNumber ?? ''))
  const phoneRaw = String(input?.phone ?? '').replace(/[\s-]/g, '')
  const consent = input?.consent === true
  const mac = normalizeMac(String(input?.mac ?? ''))
  const ip = String(input?.ip ?? '').trim() || null

  const errors: RegisterState['errors'] = {}

  if (fullName.length < 2 || fullName.length > 200) {
    errors.fullName = 'กรุณากรอกชื่อ-นามสกุล'
  }

  const docType = DOC_TYPES.find((t) => t === docTypeRaw)
  if (!docType) {
    errors.docType = 'กรุณาเลือกประเภทเอกสาร'
  } else if (!docNumber) {
    errors.docNumber = 'กรุณากรอกเลขที่เอกสาร'
  } else {
    errors.docNumber = validateDocNumber(docType, docNumber)
  }

  if (phoneRaw && !/^0\d{8,9}$/.test(phoneRaw)) {
    errors.phone = 'เบอร์โทรศัพท์ไม่ถูกต้อง'
  }

  if (!consent) {
    errors.consent = 'กรุณายอมรับเงื่อนไขการใช้งาน'
  }

  if (Object.values(errors).some(Boolean)) {
    return { ok: false, errors }
  }

  if (!mac) {
    return {
      ok: false,
      message: 'ไม่พบข้อมูลอุปกรณ์ กรุณาตัดการเชื่อมต่อแล้วเชื่อมต่อ WiFi ใหม่อีกครั้ง',
    }
  }

  try {
    const docNumberHmac = hashDocNumber(docNumber)

    // RADIUS would reject this person anyway; say why instead of letting the EG
    // show its generic error
    const quota = await quotaToday({ mac, hmac: docNumberHmac })
    if (quota.remainingSeconds <= 0) {
      return { ok: false, exhaustedLimitSeconds: quota.limitSeconds }
    }

    // Same person on the same device again today: log in with the username
    // they already have instead of piling up registrations
    const session =
      (await findTodaySession(mac, docNumberHmac)) ??
      (await createSession({
        authMethod: 'form',
        fullName,
        docType: docType!,
        docNumberEnc: encryptDocNumber(docNumber),
        docNumberHmac,
        docLast4: last4(docNumber),
        phone: phoneRaw || null,
        mac,
        ip,
        consentVersion: CONSENT_VERSION,
        sessionTimeoutSeconds: quota.limitSeconds,
      }))

    // The browser has to log in at the EG itself (see lib/gateway). Handing it
    // the credentials is fine: they're random per registration, only accepted
    // from this MAC, one device at a time, and expire with the session.
    return {
      ok: true,
      expiresAt: nextBangkokMidnight().toISOString(),
      remainingSeconds: quota.remainingSeconds,
      loginUrl: gatewayLoginUrl(session.username, session.password),
    }
  } catch (err) {
    console.error('register failed', err)
    return { ok: false, message: 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง' }
  }
}
