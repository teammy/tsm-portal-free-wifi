import 'server-only'
import { sql } from 'kysely'
import { db } from './db'
import { gatewayLoginUrl } from './gateway'
import { normalizeMac } from './mac'

/** RADIUS group of every portal username; its radgroupcheck holds the daily limit */
export const RADIUS_GROUP = 'freewifi'
/** Check item read by the daily_person sqlcounter (freeradius/mods-available/daily_person) */
const LIMIT_ATTRIBUTE = 'Max-Daily-Person-Session'
const DEFAULT_LIMIT_SECONDS = 4 * 3600
const BKK_OFFSET_MS = 7 * 3600_000   // Asia/Bangkok, no DST
const DAY_MS = 86_400_000

/** Today 00:00 Asia/Bangkok — when the daily quota resets */
export function startOfBangkokDay(now = new Date()): Date {
  const bkk = new Date(now.getTime() + BKK_OFFSET_MS)
  bkk.setUTCHours(0, 0, 0, 0)
  return new Date(bkk.getTime() - BKK_OFFSET_MS)
}

/** Next 00:00 Asia/Bangkok — each username lives until then */
export function nextBangkokMidnight(now = new Date()): Date {
  return new Date(startOfBangkokDay(now).getTime() + DAY_MS)
}

/** Limit as configured for FreeRADIUS, so changing it in radgroupcheck needs no deploy */
export async function dailyLimitSeconds(): Promise<number> {
  const row = await db
    .selectFrom('radgroupcheck')
    .select('value')
    .where('groupname', '=', RADIUS_GROUP)
    .where('attribute', '=', LIMIT_ATTRIBUTE)
    .executeTakeFirst()
  const n = Number(row?.value)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LIMIT_SECONDS
}

/**
 * Connected time since 00:00 today of everyone matching this MAC or document
 * HMAC. Same rule as the daily_person sqlcounter — keep the two in sync — so
 * the portal can turn a person away before the EG shows its own RADIUS error.
 */
async function usedSecondsToday(person: { mac: string; hmac: Buffer | null }): Promise<number> {
  const dayStart = Math.floor(startOfBangkokDay().getTime() / 1000)
  const { rows } = await sql<{ used: string | number }>`
    SELECT COALESCE(SUM(GREATEST(0,
      UNIX_TIMESTAMP(COALESCE(a.acctstoptime, a.acctupdatetime, a.acctstarttime))
      - GREATEST(UNIX_TIMESTAMP(a.acctstarttime), ${dayStart}))), 0) AS used
    FROM registrations r
    JOIN radacct a ON a.username = r.session_username
    WHERE r.created_at >= FROM_UNIXTIME(${dayStart - 86400})
      AND (r.mac = ${person.mac} OR r.doc_number_hmac = ${person.hmac})
      AND COALESCE(a.acctstoptime, a.acctupdatetime, a.acctstarttime) > FROM_UNIXTIME(${dayStart})
  `.execute(db)
  return Number(rows[0]?.used ?? 0)
}

export async function quotaToday(person: { mac: string; hmac: Buffer | null }) {
  const [limit, used] = await Promise.all([dailyLimitSeconds(), usedSecondsToday(person)])
  return { limitSeconds: limit, remainingSeconds: Math.max(0, limit - used) }
}

/**
 * Today's still-valid username registered from this device (and, when given,
 * by this person), with its RADIUS password so the browser can log in again.
 */
export async function findTodaySession(mac: string, hmac?: Buffer) {
  let query = db
    .selectFrom('registrations as r')
    .innerJoin('radcheck as c', (join) =>
      join.onRef('c.username', '=', 'r.session_username').on('c.attribute', '=', 'Cleartext-Password'),
    )
    .select(['r.session_username as username', 'c.value as password', 'r.doc_number_hmac as hmac'])
    .where('r.mac', '=', mac)
    .where('r.created_at', '>=', startOfBangkokDay())
    .where('r.expires_at', '>', new Date())
    .orderBy('r.id', 'desc')
  if (hmac) query = query.where('r.doc_number_hmac', '=', hmac)
  return query.executeTakeFirst()
}

export type DeviceStatus =
  | { kind: 'new' }
  | { kind: 'exhausted'; limitSeconds: number }
  | { kind: 'active'; remainingSeconds: number; loginUrl: string }

/**
 * What the portal should show a device the EG just redirected here. Anyone can
 * put any client_mac in the URL, so 'active' carries no personal data — only
 * credentials that RADIUS accepts from that MAC alone.
 */
export async function deviceStatus(rawMac: string): Promise<DeviceStatus> {
  const mac = normalizeMac(rawMac)
  if (!mac) return { kind: 'new' }

  const session = await findTodaySession(mac)
  if (!session) return { kind: 'new' }

  const quota = await quotaToday({ mac, hmac: session.hmac })
  if (quota.remainingSeconds <= 0) return { kind: 'exhausted', limitSeconds: quota.limitSeconds }

  return {
    kind: 'active',
    remainingSeconds: quota.remainingSeconds,
    loginUrl: gatewayLoginUrl(session.username, session.password),
  }
}
