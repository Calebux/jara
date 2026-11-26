'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

// Jara Streak on the dashboard: a countdown before it starts, "Live" with a Play button while it
// runs, and a link to the final leaderboard for three days after it ends.

export type StreakBannerState = {
  phase: 'soon' | 'open' | 'closed'
  startAt: number
  endAt: number
  prizePoolGd: number
  prizesGd: number[]
  winners: number
  perCorrectGd: number
  golden: { live: boolean; startsAt: number | null; endsAt: number | null }
}

function left(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`
}

export function StreakBanner({ streak }: { streak?: StreakBannerState }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id) }, [])
  if (!streak) return null
  const phase = now >= streak.endAt ? 'closed' : now >= streak.startAt ? 'open' : 'soon'
  if (phase === 'closed' && now > streak.endAt + 3 * 86_400_000) return null
  const prize = `G$ ${streak.prizePoolGd.toLocaleString('en-US')} prize pool for the top ${streak.winners}`
  const golden = streak.golden.live && streak.golden.endsAt && now < streak.golden.endsAt
  return (
    <Link href="/app/streak" className="group block overflow-hidden rounded-[22px] bg-forest text-cream transition hover:bg-forest-soft">
      {golden && <div className="bg-crest px-5 py-2 text-xs font-bold text-ink sm:px-6">⚡ Golden Hour live: double points right now</div>}
      <div className="flex items-center gap-4 p-5 sm:px-6">
        <span aria-hidden className="streak-flame grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-mandarin text-2xl">🔥</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold tracking-[0.14em] text-crest uppercase">
            {phase === 'open' ? <><span className="streak-live mr-1.5 inline-block h-2 w-2 rounded-full bg-mandarin align-middle" />Live · ends in {left(streak.endAt - now)}</> : phase === 'soon' ? `Campus bounty · starts in ${left(streak.startAt - now)}` : 'Campus bounty · ended'}
          </p>
          <p className="mt-0.5 text-lg leading-snug font-bold">Jara Streak: how many can you get right in a row?</p>
          <p className="text-sm text-cream/75">{phase === 'closed' ? 'See the winners. Winners: tap to claim your prize.' : `${prize}${streak.perCorrectGd > 0 ? ` · G$ ${streak.perCorrectGd} per correct answer` : ''}. Free to play.`}</p>
        </div>
        <span className="hidden shrink-0 rounded-xl bg-mandarin px-4 py-2.5 text-sm font-bold text-white group-hover:bg-mandarin-deep sm:block">{phase === 'open' ? 'Play now →' : phase === 'soon' ? 'See how →' : 'Results →'}</span>
      </div>
    </Link>
  )
}
