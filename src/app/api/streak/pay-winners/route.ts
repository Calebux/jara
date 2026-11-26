import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { serverConfig } from '@/lib/env'
import { payWinners } from '@/lib/streak/service'
import { streakFailure } from '@/lib/streak/http'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// After the bounty closes: freeze the winners and send each prize once. The auto-pay cron also does
// this every run, so this is only for checking or nudging it by hand. Safe to call again.
// Header: Authorization: Bearer $CRON_SECRET
export async function POST(req: Request) {
  const secret = serverConfig().cronSecret
  const got = Buffer.from(req.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${secret}`)
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { return NextResponse.json(await payWinners()) }
  catch (err) { return streakFailure(err, 'streak-pay-winners') }
}
