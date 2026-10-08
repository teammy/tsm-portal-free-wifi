import 'server-only'
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

const VERSION = 1          // เผื่อเปลี่ยน key/อัลกอริทึมในอนาคต
const IV_LEN = 12
const TAG_LEN = 16

function loadKey(name: string): Buffer {
  const b64 = process.env[name]
  if (!b64) throw new Error(`${name} is not set`)
  const key = Buffer.from(b64, 'base64')
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes (base64)`)
  return key
}

const ENC_KEY = loadKey('DOC_ENC_KEY')
const HMAC_KEY = loadKey('DOC_HMAC_KEY')

/** ตัดช่องว่าง/ขีด และทำเป็นตัวพิมพ์ใหญ่ ก่อนตรวจและเข้ารหัส */
export function normalizeDocNumber(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase()
}

/** เข้ารหัส → [version 1B][iv 12B][tag 16B][ciphertext] เก็บใน VARBINARY */
export function encryptDocNumber(plain: string): Buffer {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', ENC_KEY, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), ct])
}

/** ถอดรหัส — ใช้เฉพาะหน้า admin เมื่อมีคำขอตามกฎหมาย */
export function decryptDocNumber(blob: Buffer): string {
  if (blob[0] !== VERSION) throw new Error(`Unsupported version ${blob[0]}`)
  const iv = blob.subarray(1, 1 + IV_LEN)
  const tag = blob.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN)
  const ct = blob.subarray(1 + IV_LEN + TAG_LEN)
  const decipher = createDecipheriv('aes-256-gcm', ENC_KEY, iv)
  decipher.setAuthTag(tag)     // ถ้าข้อมูลถูกแก้ไข จะ throw error
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

/** ค่าสำหรับค้นหาแบบตรงตัว โดยไม่ต้องถอดรหัสทั้งตาราง */
export function hashDocNumber(plain: string): Buffer {
  return createHmac('sha256', HMAC_KEY).update(plain).digest()
}

export function last4(plain: string): string {
  return plain.slice(-4)
}