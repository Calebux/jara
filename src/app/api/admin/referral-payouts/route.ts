import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { run } from '@/lib/db'
import { markMilestonePaidManually } from '@/lib/referral-payout'

export const dynamic = 'force-dynamic'

function authorized(req: Request): boolean {
  const key = process.env.ADMIN_KEY
  if (!key) return false
  const a = Buffer.from((req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''))
  const b = Buffer.from(key)
  return a.length === b.length && timingSafeEqual(a, b)
}
const deny = () => NextResponse.json({ error: process.env.ADMIN_KEY ? 'Wrong admin key' : 'Set ADMIN_KEY on the server first' }, { status: 401 })

/** Every invite-reward payout, newest first (account numbers shortened). */
export async function GET(req: Request) {
  if (!authorized(req)) return deny()
  const rows = (await run(`SELECT p.user_id, u.name, u.root_address, p.milestone, p.attempt, p.status, p.amount_ngn, p.receive_naira, p.bank_name,
    substr(p.account_number, -4) AS account_ending, p.cashout_id, p.tx_hash, p.error, p.updated_at FROM referral_payouts p JOIN users u ON u.id = p.user_id ORDER BY p.updated_at DESC LIMIT 200`)).rows
  return NextResponse.json({ payouts: rows })
}

/**
 * { wallet | userId, milestone, note }: record a reward already paid outside Jara (for example by
 * bank transfer), so Jara never pays that milestone again. milestone 1 = the first 10 friends.
 */
export async function POST(req: Request) {
  if (!authorized(req)) return deny()
  const body = (await req.json().catch(() => ({}))) as { wallet?: string; userId?: string; milestone?: number; note?: string }
  const users = body.userId
    ? (await run('SELECT id FROM users WHERE id = ?', [body.userId])).rows
    : body.wallet ? (await run('SELECT id FROM users WHERE lower(root_address) = lower(?)', [body.wallet])).rows : []
  if (users.length !== 1) return NextResponse.json({ error: users.length ? 'That wallet has several accounts; send userId instead.' : 'No account found.' }, { status: 404 })
  try {
    return NextResponse.json(await markMilestonePaidManually(String(users[0].id), Number(body.milestone ?? 1), body.note ?? 'Paid outside Jara'))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 400 })
  }
}
