import { TEST_WALLET, isGoodCashError, type Quote } from '@goodcash/sdk'
import type { Address, Hex } from 'viem'
import * as chain from './chain'
import { TransferPendingError, TransferRevertedError, hasSubmittedTransaction } from './chain-outbox'
import { atomic, run } from './db'
import { serverConfig } from './env'
import * as gc from './goodcash-client'
import { withUserLock } from './jars'
import { getUserById, type User } from './users'
import { authorizedUser } from './wallet-authorization'

// Invite milestone rewards, paid in naira straight to the person's bank.
//
// Every REFERRAL_MILESTONE_FRIENDS verified friends (10 by default) earns REFERRAL_MILESTONE_NGN.
// The person only picks their bank and types their account number; Jara's treasury pays the G$ to
// GoodCash from the server, so they sign nothing, need no wallet open and pay no network fee.
//
// Friends are counted from referral_identities: one row per verified GoodDollar identity, app wide,
// so extra accounts of the same person never count twice.
//
// Money safety:
// - One row per milestone. A new attempt is only made after GoodCash says the earlier one failed,
//   expired or was refunded, or when nothing was ever sent.
// - GoodCash's transaction is checked (assertSafeTransaction) before the treasury signs it.
// - The treasury transaction is durable (chain_transactions): a retry replays the same signed bytes.

export class ReferralPayoutError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

type Status = 'preparing' | 'sending' | 'sent' | 'paid' | 'failed' | 'manual'

interface PayoutRow {
  user_id: string
  milestone: number
  attempt: number
  status: Status
  amount_ngn: number
  amount_g: string | null
  fee_percent: number | null
  bank_code: string | null
  bank_name: string | null
  account_number: string | null
  account_name: string | null
  cashout_id: string | null
  tx_to: string | null
  tx_data: string | null
  expires_at: number | null
  tx_hash: string | null
  receive_naira: number | null
  error: string | null
}

export function milestoneConfig() {
  const { friends, ngn } = serverConfig().referralMilestone
  const goodcash = serverConfig().goodcash.secretKey.startsWith('gc_sk_')
  return { friends: Math.max(1, Math.floor(friends)), ngn: Math.max(0, Math.floor(ngn)), enabled: ngn > 0 && goodcash }
}

const opId = (r: Pick<PayoutRow, 'user_id' | 'milestone' | 'attempt'>) => `goodcash:referral:${r.user_id}:${r.milestone}:${r.attempt}`
const idempotencyKey = (r: Pick<PayoutRow, 'user_id' | 'milestone' | 'attempt'>) => `jara-referral-${r.user_id}-${r.milestone}-${r.attempt}`
const isTestKey = () => serverConfig().goodcash.secretKey.startsWith('gc_sk_test_')

async function verifiedFriends(userId: string): Promise<number> {
  return Number((await run('SELECT COUNT(*) AS n FROM referral_identities WHERE referrer_id = ?', [userId])).rows[0].n)
}

async function rows(userId: string): Promise<PayoutRow[]> {
  return (await run('SELECT * FROM referral_payouts WHERE user_id = ? ORDER BY milestone', [userId])).rows as unknown as PayoutRow[]
}

async function row(userId: string, milestone: number): Promise<PayoutRow | null> {
  return ((await run('SELECT * FROM referral_payouts WHERE user_id = ? AND milestone = ?', [userId, milestone])).rows[0] as unknown as PayoutRow) ?? null
}

async function save(r: PayoutRow, patch: Partial<PayoutRow>) {
  const keys = Object.keys(patch) as (keyof PayoutRow)[]
  await run(`UPDATE referral_payouts SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE user_id = ? AND milestone = ?`,
    [...keys.map((k) => (patch[k] ?? null) as string | number | null), Date.now(), r.user_id, r.milestone])
  Object.assign(r, patch)
}

const inFlight = (r: PayoutRow) => r.status === 'preparing' || r.status === 'sending' || r.status === 'sent'

/** What the Rewards screen shows. Database reads only. */
export async function referralRewardState(user: User) {
  const cfg = milestoneConfig()
  const friends = await verifiedFriends(user.id)
  const earned = Math.floor(friends / cfg.friends)
  const list = await rows(user.id)
  const byMilestone = new Map(list.map((r) => [Number(r.milestone), r]))
  const current = list.find(inFlight) ?? null
  let ready: number | null = null
  if (!current) for (let m = 1; m <= earned; m++) {
    const r = byMilestone.get(m)
    if (!r || r.status === 'failed') { ready = m; break }
  }
  const view = (r: PayoutRow) => ({
    milestone: Number(r.milestone),
    status: r.status === 'preparing' || r.status === 'sending' || r.status === 'sent' ? 'processing' as const : r.status,
    amountNgn: Number(r.amount_ngn),
    receiveNaira: r.receive_naira == null ? null : Number(r.receive_naira),
    bankName: r.bank_name,
    accountEnding: r.account_number ? r.account_number.slice(-4) : null,
    accountName: r.account_name,
    error: r.status === 'failed' ? r.error : null,
  })
  return {
    enabled: cfg.enabled,
    friendsPerReward: cfg.friends,
    rewardNgn: cfg.ngn,
    verifiedFriends: friends,
    /** Friends counted toward the next reward. */
    towardNext: friends - earned * cfg.friends,
    ready: cfg.enabled ? ready : null,
    processing: current ? view(current) : null,
    paid: list.filter((r) => r.status === 'paid' || r.status === 'manual').map(view),
    lastFailed: ready && byMilestone.get(ready)?.status === 'failed' ? view(byMilestone.get(ready)!) : null,
  }
}
export type ReferralRewardState = Awaited<ReturnType<typeof referralRewardState>>

function cleanAccount(input: { bankCode?: unknown; accountNumber?: unknown }) {
  const bankCode = typeof input.bankCode === 'string' ? input.bankCode.trim() : ''
  const accountNumber = typeof input.accountNumber === 'string' ? input.accountNumber.replace(/\D/g, '') : ''
  if (!bankCode || bankCode.length > 20) throw new ReferralPayoutError('Choose your bank.')
  if (accountNumber.length !== 10) throw new ReferralPayoutError('Enter your 10-digit account number.')
  return { bankCode, accountNumber }
}

function friendly(err: unknown, fallback: string): string {
  if (err instanceof ReferralPayoutError) return err.message
  if (isGoodCashError(err)) {
    if (err.code === 'bank_account_not_found') return 'We couldn’t find that account. Check the bank and the 10 digits.'
    if (err.code === 'cashout_paused' || err.code === 'unavailable' || err.code === 'network_error' || err.code === 'rate_limited') return 'Bank payouts are busy right now. Please try again in a few minutes.'
    if (err.code === 'insufficient_balance' || err.code === 'needs_network_fee') return 'Your reward is being prepared. Please try again in a little while.'
  }
  return fallback
}

/** The account holder's name, so the person can confirm it is theirs before anything is sent. */
export async function verifyPayoutAccount(input: { bankCode?: unknown; accountNumber?: unknown }) {
  const account = cleanAccount(input)
  try {
    const { accountName } = await gc.goodCashServer().verifyAccount(account)
    return { accountName }
  } catch (err) {
    throw new ReferralPayoutError(friendly(err, 'We couldn’t check that account right now. Please try again.'), 400)
  }
}

/**
 * G$ to send so the bank receives at least `ngn` naira after GoodCash's fees (GoodDollar exit
 * contribution, GoodCash fee, bank fee). Receive is close to linear in G$, so a few quotes settle it.
 */
async function quoteFor(ngn: number): Promise<{ amountG: number; quote: Quote }> {
  const client = gc.goodCashServer()
  let amountG = 20_000
  let quote = await client.quote({ amountG })
  for (let i = 0; i < 5; i++) {
    const got = quote.receive.naira
    if (got >= ngn && got <= ngn * 1.01 + 50) return { amountG, quote }
    const next = Math.ceil(got > 0 ? amountG * (ngn / got) * 1.002 : amountG * 2)
    if (next === amountG) break
    amountG = next
    quote = await client.quote({ amountG })
  }
  while (quote.receive.naira < ngn) { amountG = Math.ceil(amountG * 1.005) + 1; quote = await client.quote({ amountG }) }
  return { amountG, quote }
}

/**
 * Start (or resume) the bank payout for the next earned milestone. Safe to call again with the
 * same details at any point: it carries on from where the last call stopped.
 */
export async function claimReferralReward(input: User, details: { bankCode?: unknown; accountNumber?: unknown }) {
  return withUserLock(input.id, async () => {
    const cfg = milestoneConfig()
    if (!cfg.enabled) throw new ReferralPayoutError('Invite rewards are not switched on yet.', 409)
    const user = await authorizedUser(input)
    const state = await referralRewardState(user)
    if (state.processing) {
      await advance(user, (await rows(user.id)).find(inFlight)!)
      return referralRewardState(user)
    }
    if (!state.ready) throw new ReferralPayoutError(`Your next reward unlocks at ${cfg.friends * (Math.floor(state.verifiedFriends / cfg.friends) + 1)} verified friends.`, 409)
    if (!isTestKey() && serverConfig().chain.mode === 'mock') throw new ReferralPayoutError('Live bank payouts need CHAIN_MODE=celo.', 409)

    const account = cleanAccount(details)
    const { accountName } = await verifyPayoutAccount(account)
    const bank = (await gc.goodCashBanks().catch(() => [])).find((b) => b.code === account.bankCode)
    let priced: Awaited<ReturnType<typeof quoteFor>>
    try { priced = await quoteFor(cfg.ngn) } catch (err) { throw new ReferralPayoutError(friendly(err, 'We couldn’t price your payout right now. Please try again.'), 503) }

    const prior = await row(user.id, state.ready)
    const now = Date.now()
    const fields = {
      status: 'preparing' as Status, amount_ngn: cfg.ngn, amount_g: String(priced.amountG), fee_percent: priced.quote.feePercent,
      bank_code: account.bankCode, bank_name: bank?.name ?? null, account_number: account.accountNumber, account_name: accountName,
      cashout_id: null, tx_to: null, tx_data: null, expires_at: null, tx_hash: null, receive_naira: null, error: null,
    }
    if (prior) {
      // Only a payout proven unpaid ends in 'failed'; the next attempt gets new identifiers.
      await run("UPDATE referral_payouts SET attempt = attempt + 1, updated_at = ? WHERE user_id = ? AND milestone = ? AND status = 'failed'", [now, user.id, state.ready])
      const r = (await row(user.id, state.ready))!
      await save(r, fields)
      await advance(user, r)
    } else {
      await run(`INSERT INTO referral_payouts (user_id, milestone, attempt, status, amount_ngn, created_at, updated_at) VALUES (?, ?, 1, 'preparing', ?, ?, ?)`, [user.id, state.ready, cfg.ngn, now, now])
      const r = (await row(user.id, state.ready))!
      await save(r, fields)
      await advance(user, r)
    }
    return referralRewardState(user)
  })
}

/** Move one payout forward as far as it can go right now. Never sends twice. */
async function advance(user: User, r: PayoutRow): Promise<void> {
  const client = gc.goodCashServer()
  const test = isTestKey()

  if (r.status === 'preparing') {
    try {
      const created = await client.createCashOut({
        wallet: test ? TEST_WALLET : chain.treasuryAddress(),
        amountG: r.amount_g!,
        recipient: { bankCode: r.bank_code!, accountNumber: r.account_number!, accountName: r.account_name! },
        feePercentShown: Number(r.fee_percent),
        partnerRef: user.id,
        idempotencyKey: idempotencyKey(r),
      })
      // The check before the treasury signs anything: exactly this cash out, to GoodCash's router.
      client.assertSafeTransaction(created, { amountG: r.amount_g! })
      await save(r, { status: 'sending', cashout_id: created.id, tx_to: created.transaction.to, tx_data: created.transaction.data, expires_at: Date.parse(created.expiresAt) || null, receive_naira: created.receive.naira })
    } catch (err) {
      // Nothing has been sent: safe to let the person try again.
      console.error('[referral-payout] could not create cash out', isGoodCashError(err) ? err.code : err instanceof Error ? err.message : 'error')
      await save(r, { status: 'failed', error: friendly(err, 'The payout could not start. Nothing was sent. Please try again.') })
      return
    }
  }

  if (r.status === 'sending') {
    if (test) {
      // Test keys: GoodCash simulates the payment; no wallet or chain is touched.
      await client.simulate(r.cashout_id!).catch(() => undefined)
      await save(r, { status: 'sent' })
    } else {
      const id = opId(r)
      if (!(await hasSubmittedTransaction(id)) && r.expires_at && Date.now() > r.expires_at - 60_000) {
        await save(r, { status: 'failed', error: 'That payout took too long to start. Nothing was sent. Please try again.' })
        return
      }
      try {
        const hash = await chain.sendTreasuryCall({ to: r.tx_to as Address, data: r.tx_data as Hex }, id)
        await save(r, { status: 'sent', tx_hash: hash })
      } catch (err) {
        if (err instanceof TransferRevertedError) { await save(r, { status: 'failed', error: 'The payout did not go through. Nothing was paid. Please try again.' }); return }
        if (err instanceof TransferPendingError) return // the same signed transaction is confirmed on the next check
        console.error('[referral-payout] treasury send failed', err instanceof Error ? err.message : 'error')
        if (!(await hasSubmittedTransaction(id))) await save(r, { status: 'failed', error: 'Your reward is being prepared. Please try again in a little while.' })
        return
      }
      await client.reportTransaction(r.cashout_id!, r.tx_hash!).catch(() => undefined)
    }
  }

  if (r.status === 'sent') {
    const c = await client.getCashOut(r.cashout_id!).catch(() => null)
    if (!c) return
    if (c.status === 'awaiting_signature' && r.tx_hash) await client.reportTransaction(r.cashout_id!, r.tx_hash).catch(() => undefined)
    else if (c.status === 'paid') await markPaid(r, c.receive.naira)
    else if (c.status === 'failed' || c.status === 'refunded' || c.status === 'expired') await markFailed(r, c.status)
  }
}

async function markPaid(r: PayoutRow, naira: number | null) {
  const received = naira ?? r.receive_naira ?? r.amount_ngn
  await atomic(async (tx) => {
    const done = await tx.execute({ sql: "UPDATE referral_payouts SET status = 'paid', receive_naira = ?, updated_at = ? WHERE user_id = ? AND milestone = ? AND status IN ('sending', 'sent')", args: [received, Date.now(), r.user_id, r.milestone] })
    if (!done.rowsAffected) return
    await tx.execute({
      sql: `INSERT OR IGNORE INTO activity (user_id, type, amount_ngn, status, title, detail, provider, provider_ref, tx_hash, operation_id, created_at)
            VALUES (?, 'cashout', ?, 'done', ?, ?, 'goodcash', ?, ?, ?, ?)`,
      args: [r.user_id, received, `Invite reward paid to your bank · ₦${Number(received).toLocaleString('en-NG')}`, `${r.bank_name ?? 'Bank'} ••${(r.account_number ?? '').slice(-4)} via GoodCash`, r.cashout_id, r.tx_hash, `goodcash:referral:${r.user_id}:${r.milestone}`, Date.now()],
    })
  })
  r.status = 'paid'
}

async function markFailed(r: PayoutRow, why: string) {
  await run("UPDATE referral_payouts SET status = 'failed', error = ?, updated_at = ? WHERE user_id = ? AND milestone = ? AND status IN ('sending', 'sent')",
    [why === 'refunded' || why === 'expired' ? 'The bank payout didn’t complete, so nothing was paid. Please try again.' : 'The bank declined the payout. Check your account details and try again.', Date.now(), r.user_id, r.milestone])
  r.status = 'failed'
}

/** Carry an in-flight payout forward (opening the Rewards screen, or the hourly job). */
export async function refreshReferralPayout(user: User) {
  const current = (await rows(user.id)).find(inFlight)
  if (!current || !milestoneConfig().enabled) return
  await withUserLock(user.id, () => advance(user, current), { waitMs: 5_000 }).catch((err) => console.warn('[referral-payout] refresh deferred', err instanceof Error ? err.message : 'error'))
}

/** Every in-flight payout, for the cron job. */
export async function refreshAllReferralPayouts() {
  const pending = (await run("SELECT DISTINCT user_id FROM referral_payouts WHERE status IN ('preparing', 'sending', 'sent')")).rows
  for (const p of pending) {
    const user = await getUserById(String(p.user_id))
    if (user) await refreshReferralPayout(user)
  }
  return pending.length
}

/** GoodCash webhook for a payout Jara itself made. Returns false if the cash out is not one of ours. */
export async function handleReferralPayoutEvent(type: string, data: { id?: string; receive?: { naira?: number } }): Promise<boolean> {
  if (!data.id) return false
  const r = (await run('SELECT * FROM referral_payouts WHERE cashout_id = ?', [data.id])).rows[0] as unknown as PayoutRow | undefined
  if (!r) return false
  if (type === 'cashout.paid') await markPaid(r, data.receive?.naira ?? null)
  else if (type === 'cashout.failed' || type === 'cashout.refunded' || type === 'cashout.expired') await markFailed(r, type.split('.')[1])
  return true
}

/**
 * Admin: record a milestone already paid outside Jara (for example by bank transfer before this
 * feature), so it is never paid again.
 */
export async function markMilestonePaidManually(userId: string, milestone: number, note: string) {
  if (!Number.isSafeInteger(milestone) || milestone < 1) throw new ReferralPayoutError('milestone must be 1 or more')
  const now = Date.now()
  const r = await run(`INSERT INTO referral_payouts (user_id, milestone, attempt, status, amount_ngn, error, created_at, updated_at) VALUES (?, ?, 1, 'manual', ?, ?, ?, ?)
    ON CONFLICT (user_id, milestone) DO UPDATE SET status = 'manual', error = excluded.error, updated_at = excluded.updated_at WHERE referral_payouts.status = 'failed'`,
  [userId, milestone, milestoneConfig().ngn, note.slice(0, 200), now, now])
  return { recorded: r.rowsAffected > 0 }
}
