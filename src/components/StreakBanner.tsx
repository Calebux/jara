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
  const pool = `G$ ${streak.prizePoolGd.toLocaleString('en-US')} prize pool`
  const golden = streak.golden.live && streak.golden.endsAt && now < streak.golden.endsAt

  // Before it starts: a slim moving ticker (an announcement), not the full banner. The banner with
  // "Play" only appears once it is live.
  if (phase === 'soon') {
    const perCorrect = streak.perCorrectGd > 0 ? ` · G$ ${streak.perCorrectGd} for every correct answer` : ''
    const msg = `🔥 Jara Streak — the campus bounty starts in ${left(streak.startAt - now)} · ${pool}, top ${streak.winners} win big${perCorrect} · invite your friends for extra runs · get ready`
    return (
      <Link href="/app/streak" aria-label={`Jara Streak starts in ${left(streak.startAt - now)}. Tap for details.`}
        className="group block overflow-hidden rounded-2xl bg-forest text-cream">
        <div className="flex items-center gap-2 py-2.5 pr-3 pl-2.5">
          <span className="shrink-0 rounded-full bg-mandarin px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-white uppercase">Soon</span>
          <div className="relative min-w-0 flex-1 overflow-hidden" aria-hidden>
            <div className="streak-ticker-track text-sm font-semibold text-cream/90">
              <span className="pr-10">{msg}</span><span className="pr-10">{msg}</span>
            </div>
          </div>
          <span className="shrink-0 text-sm font-bold text-crest">Details →</span>
        </div>
      </Link>
    )
  }

  return (
    <Link href="/app/streak" className="group streak-rings relative block overflow-hidden rounded-[22px] bg-forest text-cream transition hover:bg-forest-soft">
      <div className="relative z-10 flex items-center gap-4 p-5 sm:px-6">
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-mandarin text-xl"><span className="streak-flame">🔥</span></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold tracking-[0.14em] text-crest uppercase">
            {golden ? <span className="text-mandarin">⚡ Golden Hour — double points now</span>
              : phase === 'open' ? <><span className="streak-live mr-1.5 inline-block h-2 w-2 rounded-full bg-mandarin align-middle" />Live · ends in {left(streak.endAt - now)}</>
              : 'Campus bounty · ended'}
          </p>
          <p className="mt-0.5 text-lg leading-snug font-bold">Jara Streak</p>
          <p className="truncate text-sm text-cream/70">{phase === 'closed' ? 'See the winners and claim your prize.' : `${pool}${streak.perCorrectGd > 0 ? ` · G$ ${streak.perCorrectGd} per correct answer` : ''}`}</p>
        </div>
        <span className="hidden shrink-0 rounded-xl bg-mandarin px-4 py-2.5 text-sm font-bold text-white group-hover:bg-mandarin-deep sm:block">{phase === 'open' ? 'Play →' : 'Results →'}</span>
      </div>
    </Link>
  )
}
