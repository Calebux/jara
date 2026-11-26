import { NextResponse, type NextRequest } from 'next/server'
import { apiFailure } from '@/lib/api-error'
import { goodCashBanks } from '@/lib/goodcash-client'
import { rateLimit } from '@/lib/ratelimit'
import { ReferralPayoutError, claimReferralReward, milestoneConfig, previewReferralPayout, referralRewardState, refreshReferralPayout, verifyPayoutAccount } from '@/lib/referral-payout'
import { fromThisSite } from '@/lib/same-site'
import { requireUser } from '@/lib/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/** The invite reward, carried forward if a bank payout is on its way. ?banks=1 lists banks. */
export async function GET(req: NextRequest) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  if (req.nextUrl.searchParams.has('banks')) {
    if (!milestoneConfig().enabled) return reply({ error: 'Invite rewards are not switched on yet.' }, 409)
    try {
      const [banks, payout] = await Promise.all([goodCashBanks(), previewReferralPayout(user)])
      return reply({ banks: banks.map((b) => ({ code: b.code, name: b.name, popular: b.popular })), payout })
    } catch (err) {
      if (err instanceof ReferralPayoutError) return reply({ error: err.message }, err.status)
      return reply({ error: 'Couldn’t load the list of banks. Please try again.' }, 503)
    }
  }
  await refreshReferralPayout(user)
  return reply({ reward: await referralRewardState(user) })
}

/** { action: 'verify' | 'claim', bankCode, accountNumber } */
export async function POST(req: NextRequest) {
  if (!fromThisSite(req)) return reply({ error: 'Requests must come from this site.' }, 403)
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const body = (await req.json().catch(() => ({}))) as { action?: string; bankCode?: unknown; accountNumber?: unknown }
  if (!rateLimit(`referral-reward:${user.id}`, 20, 10 * 60_000)) return reply({ error: 'Too many tries. Please wait a few minutes.' }, 429)
  try {
    if (body.action === 'verify') return reply(await verifyPayoutAccount(body))
    if (body.action === 'claim') return reply({ reward: await claimReferralReward(user, body) })
    return reply({ error: 'Unknown action' }, 400)
  } catch (err) {
    if (err instanceof ReferralPayoutError) return reply({ error: err.message }, err.status)
    return apiFailure(err, 'referral-reward')
  }
}
