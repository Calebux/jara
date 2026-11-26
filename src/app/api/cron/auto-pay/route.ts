import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { runAutoPayForAll } from '@/lib/auto-pay'
import { serverConfig } from '@/lib/env'
import { MoneyBusyError } from '@/lib/money-lock'
import { payWinners } from '@/lib/streak/service'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: Request) {
  const secret = serverConfig().cronSecret
  const got = Buffer.from(req.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${secret}`)
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const results = await runAutoPayForAll()
    // Once Jara Streak closes, its winners are paid on the next run (each prize exactly once).
    const streakPrizes = await payWinners().catch((err) => { console.warn('[streak] prizes will retry', err instanceof Error ? err.message : 'error'); return null })
    return NextResponse.json({ ran: results.length, results, streakPrizes })
  } catch (err) {
    if (err instanceof MoneyBusyError) return NextResponse.json({ skipped: 'A check is already running' })
    console.warn('[auto-pay] sweep failed')
    return NextResponse.json({ error: 'Auto-pay check will retry next minute' }, { status: 503 })
  }
}
