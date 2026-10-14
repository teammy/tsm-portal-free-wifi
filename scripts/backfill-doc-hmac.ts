/**
 * One-off: fill registrations.doc_number_hmac for rows written before the
 * portal started storing it. Decrypts doc_number_enc, HMACs the plaintext the
 * same way lib/crypto does, and only touches rows where the HMAC is NULL.
 *
 * Run it inside the portal container so it gets the production env and DB
 * route (the image has no scripts/, so feed it on stdin):
 *
 *   docker exec -i -w /app free-wifi-portal bun run - < scripts/backfill-doc-hmac.ts
 *
 * REHASH=1 (docker exec -e REHASH=1 ...) recomputes every row instead — use it
 * if rows were hashed with the wrong DOC_HMAC_KEY.
 *
 * Standalone on purpose: lib/crypto imports 'server-only', which only resolves
 * inside Next. Keep the format below in sync with encryptDocNumber. Imports
 * plain 'mysql2' (as lib/db does) so it resolves in the standalone image.
 */
import { createDecipheriv, createHmac } from 'node:crypto'
import mysql, { type RowDataPacket } from 'mysql2'

const VERSION = 1
const IV_LEN = 12
const TAG_LEN = 16

function loadKey(name: string): Buffer {
  const key = Buffer.from(process.env[name] ?? '', 'base64')
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes (base64)`)
  return key
}

const ENC_KEY = loadKey('DOC_ENC_KEY')
const HMAC_KEY = loadKey('DOC_HMAC_KEY')

function decrypt(blob: Buffer): string {
  if (blob[0] !== VERSION) throw new Error(`Unsupported version ${blob[0]}`)
  const iv = blob.subarray(1, 1 + IV_LEN)
  const tag = blob.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN)
  const ct = blob.subarray(1 + IV_LEN + TAG_LEN)
  const decipher = createDecipheriv('aes-256-gcm', ENC_KEY, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

const conn = mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
}).promise()

const rehash = process.env.REHASH === '1'

const [rows] = await conn.query<(RowDataPacket & { id: number; doc_number_enc: Buffer })[]>(
  rehash
    ? 'SELECT id, doc_number_enc FROM registrations'
    : 'SELECT id, doc_number_enc FROM registrations WHERE doc_number_hmac IS NULL',
)

let ok = 0
let failed = 0
for (const row of rows) {
  try {
    const hmac = createHmac('sha256', HMAC_KEY).update(decrypt(row.doc_number_enc)).digest()
    await conn.execute(
      rehash
        ? 'UPDATE registrations SET doc_number_hmac = ? WHERE id = ?'
        : 'UPDATE registrations SET doc_number_hmac = ? WHERE id = ? AND doc_number_hmac IS NULL',
      [hmac, row.id],
    )
    ok++
  } catch (err) {
    // Wrong DOC_ENC_KEY or tampered row — leave it NULL and report
    console.error(`id=${row.id}: ${(err as Error).message}`)
    failed++
  }
}

console.log(`backfilled ${ok}, failed ${failed}, of ${rows.length}`)
await conn.end()
if (failed) process.exit(1)
