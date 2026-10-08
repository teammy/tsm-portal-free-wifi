import 'server-only'
import { randomBytes } from 'node:crypto'
import { db } from './db'

const SESSION_HOURS = 8
const IDLE_SECONDS = 1800

function toRadiusExpiration(d: Date): string {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())} ${m[d.getMonth()]} ${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export async function createSession(input: {
  authMethod: 'thaid' | 'form'
  fullName: string
  docType: 'thai_id' | 'passport' | 'pink_card' | 'other'
  docNumberEnc: Buffer          // เข้ารหัสมาแล้วจาก lib/crypto
  docLast4: string | null
  phone: string | null
  mac: string                   // แปลงเป็นรูปแบบเดียวกับที่ EG ส่งใน RADIUS แล้ว
  ip: string | null
  consentVersion: string
}) {
  const username = `s-${randomBytes(4).toString('hex')}`
  const password = randomBytes(18).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000)

  await db.transaction().execute(async (trx) => {
    await trx.insertInto('registrations').values({
      session_username: username,
      auth_method: input.authMethod,
      full_name: input.fullName,
      doc_type: input.docType,
      doc_number_enc: input.docNumberEnc,
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
      { username, attribute: 'Calling-Station-Id', op: '==', value: input.mac },
      { username, attribute: 'Simultaneous-Use',   op: ':=', value: '1' },
    ]).execute()

    await trx.insertInto('radreply').values([
      { username, attribute: 'Session-Timeout', op: ':=', value: String(SESSION_HOURS * 3600) },
      { username, attribute: 'Idle-Timeout',    op: ':=', value: String(IDLE_SECONDS) },
    ]).execute()
  })

  // คืน credential เพื่อนำไปล็อกอินที่ EG แทนผู้ใช้ (ห้ามแสดงให้ผู้ใช้เห็น)
  return { username, password, expiresAt }
}