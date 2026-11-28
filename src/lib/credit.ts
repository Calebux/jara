import type { Transaction } from '@libsql/client'
import { run } from './db'

// Jara credit: G$ that Jara holds for someone in the treasury, which they can spend on Jara's
// services (airtime, data, electricity, Jara AI) but never withdraw. It comes from bounty prizes
// (Jara Streak pays part of each prize as credit). Paying with credit moves no tokens: the treasury
// already holds them. A refund of a credit payment goes back to credit, never to a wallet.

/** The credit balance in wei. Pass a transaction to read it inside one. */
export async function creditWei(userId: string, tx?: Transaction): Promise<bigint> {
  const rows = tx
    ? (await tx.execute({ sql: 'SELECT amount_wei FROM credit_entries WHERE user_id = ?', args: [userId] })).rows
    : (await run('SELECT amount_wei FROM credit_entries WHERE user_id = ?', [userId])).rows
  const total = rows.reduce((sum, r) => sum + BigInt(String(r.amount_wei)), 0n)
  return total > 0n ? total : 0n
}

/** Record a credit movement once (positive grants, negative spends). Returns false if already recorded. */
export async function addCredit(tx: Transaction, entry: { id: string; userId: string; amountWei: bigint; reason: string }): Promise<boolean> {
  const done = await tx.execute({
    sql: 'INSERT OR IGNORE INTO credit_entries (id, user_id, amount_wei, reason, created_at) VALUES (?, ?, ?, ?, ?)',
    args: [entry.id, entry.userId, String(entry.amountWei), entry.reason, Date.now()],
  })
  return done.rowsAffected > 0
}

/** For the stats: credit given out, and how much of it was really spent on Jara services. */
export async function creditTotals(): Promise<{ grantedGd: number; spentGd: number; outstandingGd: number }> {
  const r = (await run(`SELECT
      COALESCE(SUM(CASE WHEN id NOT LIKE 'refund:%' AND id NOT LIKE 'release:%' AND CAST(amount_wei AS REAL) > 0 THEN CAST(amount_wei AS REAL) ELSE 0 END), 0) AS granted,
      COALESCE(SUM(CASE WHEN CAST(amount_wei AS REAL) < 0 THEN -CAST(amount_wei AS REAL) ELSE 0 END), 0) AS debited,
      COALESCE(SUM(CASE WHEN id LIKE 'refund:%' OR id LIKE 'release:%' THEN CAST(amount_wei AS REAL) ELSE 0 END), 0) AS returned
    FROM credit_entries`)).rows[0]
  const gd = (wei: unknown) => Math.round(Number(wei) / 1e18)
  const grantedGd = gd(r.granted), spentGd = gd(Number(r.debited) - Number(r.returned))
  return { grantedGd, spentGd, outstandingGd: Math.max(0, grantedGd - spentGd) }
}
