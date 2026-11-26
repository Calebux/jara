'use client'

import { useEffect, useMemo, useState } from 'react'
import { ApiError, readApiResponse } from '@/lib/api-response'
import { Icon } from './Icon'
import { useSheetDialog } from './useSheetDialog'

// Invite milestone reward: progress toward the next reward, a celebration when it is ready, and a
// two-field bank payout (bank + account number). Jara pays it from its own wallet through GoodCash,
// so the person signs nothing and needs no G$ or gas of their own.

export type InviteRewardState = {
  enabled: boolean
  friendsPerReward: number
  rewardNgn: number
  verifiedFriends: number
  towardNext: number
  ready: number | null
  processing: Payout | null
  paid: Payout[]
  lastFailed: Payout | null
}
type Payout = { milestone: number; status: string; amountNgn: number; receiveNaira: number | null; bankName: string | null; accountEnding: string | null; accountName: string | null; error: string | null }
type Bank = { code: string; name: string; popular: boolean }

const ngn = (n: number) => `₦${n.toLocaleString('en-NG')}`

async function call<T>(body?: unknown, query = ''): Promise<T> {
  const res = await fetch(`/api/referral-reward${query}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => { throw new ApiError('The connection dropped. Please try again.', 'network', 0, true) })
  return readApiResponse<T>(res)
}

export function InviteReward({ initial, name, flash }: { initial: InviteRewardState | null | undefined; name: string | null; flash: (t: string) => void }) {
  const [reward, setReward] = useState(initial ?? null)
  const [open, setOpen] = useState(false)
  const processing = reward?.processing

  // A payout on its way: check on it until it lands (GoodCash usually pays within minutes).
  useEffect(() => {
    if (!processing) return
    let live = true
    const tick = () => call<{ reward: InviteRewardState }>().then((r) => {
      if (!live) return
      if (!r.reward.processing && r.reward.paid.length > (reward?.paid.length ?? 0)) flash('Your invite reward is in your bank 🎉')
      setReward(r.reward)
    }).catch(() => {})
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') tick() }, 8_000)
    return () => { live = false; window.clearInterval(id) }
  }, [processing, reward?.paid.length, flash])

  if (!reward?.enabled) return null
  const { friendsPerReward: goal, rewardNgn, towardNext } = reward
  const lastPaid = reward.paid.at(-1)

  return (
    <>
      {reward.ready ? (
        <div className="mt-4 overflow-hidden rounded-2xl bg-forest text-cream">
          <div className="p-5">
            <p className="text-[11px] font-bold tracking-[0.14em] text-crest uppercase">Reward ready</p>
            <p className="mt-1 text-xl leading-snug font-bold">🎉 Congratulations{name ? `, ${name.split(' ')[0]}` : ''}!</p>
            <p className="mt-1 text-sm leading-relaxed text-cream/85">
              You’ve brought {goal * reward.ready} verified friends to Jara. Your <b className="text-cream">{ngn(rewardNgn)}</b> reward is ready to go straight to your bank account.
            </p>
            {reward.lastFailed?.error && <p className="mt-3 rounded-xl bg-cream/10 px-3 py-2 text-sm font-semibold">{reward.lastFailed.error}</p>}
            <button onClick={() => setOpen(true)} className="app-button mt-4 w-full justify-center bg-mandarin text-white hover:opacity-95 min-h-12 text-sm">
              Cash out {ngn(rewardNgn)} to my bank <Icon name="arrow" className="h-4 w-4" />
            </button>
            <p className="mt-2 text-center text-[11px] font-semibold text-cream/60">Free for you · no wallet needed · usually paid in minutes</p>
          </div>
        </div>
      ) : processing ? (
        <div className="mt-4 rounded-2xl bg-[#faf4dc] p-5">
          <p className="text-[11px] font-bold tracking-[0.14em] text-ink/50 uppercase">On its way</p>
          <p className="mt-1 font-bold">{ngn(processing.amountNgn)} is being sent to {processing.bankName ?? 'your bank'} ••{processing.accountEnding}</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10"><div className="h-full w-2/3 animate-pulse rounded-full bg-mandarin" /></div>
          <p className="mt-2 text-xs font-semibold text-ink/55">Usually within minutes. You can leave this page; we’ll keep checking.</p>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl bg-[#f4f5ef] p-5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-bold">Invite {goal} friends, get {ngn(rewardNgn)}</p>
            <span className="shrink-0 text-sm font-bold text-forest">{towardNext}/{goal}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10">
            <div className="h-full rounded-full bg-mandarin transition-all" style={{ width: `${Math.max((towardNext / goal) * 100, 4)}%` }} />
          </div>
          <p className="mt-2 text-xs font-semibold text-ink/55">
            {goal - towardNext} more verified friend{goal - towardNext === 1 ? '' : 's'} and {ngn(rewardNgn)} goes straight to your bank account.
          </p>
        </div>
      )}
      {lastPaid && !reward.ready && !processing && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-forest">
          <Icon name="check" className="h-3.5 w-3.5" strokeWidth={3} />
          {reward.paid.length > 1 ? `${reward.paid.length} rewards paid` : `${ngn(lastPaid.receiveNaira ?? lastPaid.amountNgn)} paid`}{lastPaid.bankName ? ` to ${lastPaid.bankName} ••${lastPaid.accountEnding}` : ''}
        </p>
      )}
      {open && reward.ready && (
        <CashOutSheet amountNgn={rewardNgn} onClose={() => setOpen(false)} onDone={(r) => { setReward(r); setOpen(false); flash(r.paid.length > reward.paid.length ? 'Paid to your bank 🎉' : 'Sent! Your bank is usually paid within minutes.') }} />
      )}
    </>
  )
}

function CashOutSheet({ amountNgn, onClose, onDone }: { amountNgn: number; onClose: () => void; onDone: (r: InviteRewardState) => void }) {
  const dialogRef = useSheetDialog(onClose)
  const [banks, setBanks] = useState<Bank[] | null>(null)
  const [search, setSearch] = useState('')
  const [bank, setBank] = useState<Bank | null>(null)
  const [account, setAccount] = useState('')
  const [holder, setHolder] = useState<{ key: string; name: string } | null>(null)
  const [checking, setChecking] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const field = 'w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-base font-medium outline-none focus:border-forest'

  useEffect(() => {
    let live = true
    call<{ banks: Bank[] }>(undefined, '?banks=1').then((r) => live && setBanks(r.banks)).catch((e) => live && setError(e instanceof Error ? e.message : 'Couldn’t load banks.'))
    return () => { live = false }
  }, [])

  // As soon as 10 digits are in, look up the account name so the person can see it is theirs.
  const key = bank && account.length === 10 ? `${bank.code}:${account}` : null
  useEffect(() => {
    if (!key) return
    let live = true
    const [bankCode, accountNumber] = key.split(':')
    Promise.resolve().then(() => { if (live) { setChecking(true); setError(null) } })
    call<{ accountName: string }>({ action: 'verify', bankCode, accountNumber })
      .then((r) => live && setHolder({ key, name: r.accountName }))
      .catch((e) => live && setError(e instanceof Error ? e.message : 'Couldn’t check that account.'))
      .finally(() => live && setChecking(false))
    return () => { live = false }
  }, [key])

  const shown = useMemo(() => {
    if (!banks) return []
    const q = search.trim().toLowerCase()
    const list = q ? banks.filter((b) => b.name.toLowerCase().includes(q)) : banks.filter((b) => b.popular)
    return list.slice(0, q ? 30 : 12)
  }, [banks, search])

  const confirmedName = holder && holder.key === key ? holder.name : null

  const send = async () => {
    if (!bank || !confirmedName) return
    setSending(true)
    setError(null)
    try {
      const r = await call<{ reward: InviteRewardState }>({ action: 'claim', bankCode: bank.code, accountNumber: account })
      if (r.reward.lastFailed?.error && r.reward.ready) setError(r.reward.lastFailed.error)
      else onDone(r.reward)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Cash out your invite reward" tabIndex={-1} onClick={(e) => e.stopPropagation()} className="animate-pop max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[1.75rem] bg-[#fcfcf8] sm:rounded-[1.75rem] sm:border sm:border-ink/10 sm:shadow-xl">
        <div className="flex items-center justify-between border-b border-ink/8 bg-white px-6 py-5">
          <div>
            <h3 className="text-xl font-bold tracking-tight">Send {ngn(amountNgn)} to my bank</h3>
            <p className="text-xs font-semibold text-ink/50">Your invite reward · free for you</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-[#f4f5ef] text-ink/60 hover:bg-[#edf2e8] hover:text-forest" aria-label="Close">
            <Icon name="x" className="h-4 w-4" strokeWidth={3} />
          </button>
        </div>

        <div className="grid gap-5 p-6">
          <div className="grid gap-2">
            <p className="text-[11px] font-bold tracking-[0.12em] text-ink/50 uppercase">1 · Your bank</p>
            {bank ? (
              <button onClick={() => { setBank(null); setHolder(null) }} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-left ring-1 ring-forest">
                <span className="font-bold">{bank.name}</span><span className="text-xs font-bold text-forest">Change</span>
              </button>
            ) : (
              <>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your bank (e.g. Opay, GTBank)" className={field} autoFocus />
                {!banks && !error && <p className="text-sm font-semibold text-ink/50">Loading banks…</p>}
                <div className="grid max-h-56 gap-1.5 overflow-y-auto">
                  {shown.map((b) => (
                    <button key={b.code} onClick={() => { setBank(b); setSearch('') }} className="rounded-xl bg-white px-4 py-2.5 text-left text-sm font-semibold ring-1 ring-ink/10 hover:ring-forest/50">{b.name}</button>
                  ))}
                  {banks && shown.length === 0 && <p className="text-sm text-ink/55">No bank matches “{search}”.</p>}
                </div>
              </>
            )}
          </div>

          <div className="grid gap-2">
            <p className="text-[11px] font-bold tracking-[0.12em] text-ink/50 uppercase">2 · Account number</p>
            <input value={account} onChange={(e) => setAccount(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" autoComplete="off" placeholder="10-digit account number" className={`${field} tracking-wider tabular-nums`} disabled={!bank} />
            {checking && <p className="text-sm font-semibold text-ink/55">Checking account…</p>}
            {confirmedName && (
              <p className="flex items-center gap-2 rounded-xl bg-[#e9f3e4] px-3 py-2.5 text-sm font-bold">
                <Icon name="check" className="h-4 w-4 text-forest" strokeWidth={3} /> {confirmedName}
              </p>
            )}
          </div>

          {error && <p role="alert" className="rounded-xl bg-[#fcf0e7] px-4 py-3 text-sm font-semibold">{error}</p>}

          <button disabled={!confirmedName || sending} onClick={() => void send()} className="app-button min-h-12 justify-center bg-forest text-sm text-cream hover:bg-forest-soft disabled:opacity-60">
            {sending ? 'Sending…' : confirmedName ? `Send ${ngn(amountNgn)} to ${confirmedName.split(' ')[0]}` : 'Send to my bank'}
          </button>
          <p className="-mt-2 text-center text-xs font-semibold text-ink/50">Make sure the name above is yours. Bank payouts can’t be reversed.</p>
          <p className="text-center text-[11px] font-semibold text-ink/40">Paid by Jara · Powered by GoodCash</p>
        </div>
      </div>
    </div>
  )
}
