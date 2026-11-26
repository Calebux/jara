'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, readApiResponse, responseMessage } from '@/lib/api-response'
import { CAMPUSES } from '@/lib/streak/campuses'
import { multiplier } from '@/lib/streak/rules'
import type { StreakBoard, StreakHome, StreakRunView } from '@/lib/streak/service'
import { Icon } from './Icon'
import { StreakAudio } from './streak-audio'

// Jara Streak, the campus bounty: how many can you get right in a row? Two answers, one is right,
// the clock gets shorter as the streak grows, one miss ends the run. The best run counts; the top 3
// when it ends win ₦5,000 in G$ each. The server keeps the clock and the score; this screen plays.

type Result = { correct: boolean; timedOut: boolean; correctChoice: number | null; points: number; golden: boolean; newBest: boolean }
type Reveal = { run: StreakRunView; choice: number | null; correctChoice: number | null }

async function request<T>(url: string, body?: object): Promise<T> {
  const res = await fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' })
    .catch(() => { throw new ApiError('The connection dropped. Check your network and try again.', 'network', 0, true) })
  return readApiResponse<T>(res)
}

const lagos = (ms: number, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', ...opts }).format(ms)
const when = (ms: number) => lagos(ms, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const num = (n: number) => n.toLocaleString('en-US')
const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`
const MEDALS = ['🥇', '🥈', '🥉']
const MUTE_KEY = 'jara-streak-muted'

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 }
}
function shortLeft(ms: number) {
  const p = parts(ms)
  return p.d > 0 ? `${p.d}d ${p.h}h` : p.h > 0 ? `${p.h}h ${p.m}m` : `${p.m}m ${String(p.s).padStart(2, '0')}s`
}

export function StreakGame() {
  const [home, setHome] = useState<StreakHome | null>(null)
  const [board, setBoard] = useState<StreakBoard | null>(null)
  const [run, setRun] = useState<StreakRunView | null>(null)
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [skew, setSkew] = useState(0)
  // Only read once sound is on, so the first render matches the server's.
  const [muted, setMuted] = useState(() => { try { return typeof window !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1' } catch { return false } })
  const [sound, setSound] = useState(false)
  const [float, setFloat] = useState<{ key: number; text: string; golden: boolean } | null>(null)
  const [shake, setShake] = useState(0)
  const [glow, setGlow] = useState(0)
  const [bestThisRun, setBestThisRun] = useState(false)
  const lock = useRef(false)
  const audio = useRef<StreakAudio | null>(null)
  const lastTick = useRef<number | null>(null)
  const lastRank = useRef<number | null>(null)

  const playing = Boolean(run && !run.finished && run.question && !reveal)

  // ---- loading ----
  const loadHome = useCallback(async () => {
    const h = await request<StreakHome>('/api/streak')
    setHome(h)
    setSkew(h.event.serverNow - Date.now())
    return h
  }, [])
  const loadBoard = useCallback(async () => {
    const b = await request<StreakBoard>('/api/streak/leaderboard').catch(() => null)
    if (!b) return
    setBoard(b)
    // Someone climbed past you: say so, by name when we can see them.
    const rank = b.you?.rank ?? null
    if (rank !== null && lastRank.current !== null && rank > lastRank.current) {
      const above = b.top[rank - 2]
      setToast(`🔥 ${above && !above.you ? above.name : 'Someone'} just passed you. You’re #${rank} now.`)
    }
    lastRank.current = rank
  }, [])

  useEffect(() => {
    let active = true
    request<StreakHome>('/api/streak')
      .then((h) => { if (!active) return; setHome(h); setSkew(h.event.serverNow - Date.now()); if (h.run) setRun(h.run) })
      .catch((e) => { if (active) setError(responseMessage(e)) })
    const board = window.setTimeout(() => void loadBoard(), 0)
    const player = audio
    return () => { active = false; window.clearTimeout(board); player.current?.stop() }
  }, [loadBoard])

  // One clock for countdowns and the question timer.
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 100); return () => window.clearInterval(id) }, [])

  // Between runs: keep the leaderboard and Golden Hour fresh. Never during a question.
  useEffect(() => {
    if (playing) return
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void loadBoard()
      void loadHome().catch(() => undefined)
    }, 20_000)
    return () => window.clearInterval(id)
  }, [playing, loadBoard, loadHome])

  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(null), 4500); return () => window.clearTimeout(t) }, [toast])

  // The moment the countdown hits zero, open the doors.
  const serverNow = now + skew
  const startsIn = home?.event.startAt ? home.event.startAt - serverNow : null
  const opening = home?.event.phase === 'soon' && startsIn !== null && startsIn <= 0
  useEffect(() => {
    if (!opening) return
    const t = window.setTimeout(() => void loadHome().then(() => loadBoard()).catch(() => undefined), 300)
    return () => window.clearTimeout(t)
  }, [opening, loadHome, loadBoard])

  // ---- sound ----
  const golden = home?.event.golden.live && home.event.golden.endsAt !== null && home.event.golden.endsAt > serverNow
  const ensureAudio = () => {
    if (!audio.current) audio.current = new StreakAudio()
    audio.current.setMuted(muted)
    audio.current.start()
    setSound(true)
  }
  const toggleSound = () => {
    if (!sound) { ensureAudio(); if (muted) { setMuted(false); audio.current?.setMuted(false); try { localStorage.removeItem(MUTE_KEY) } catch {} } return }
    const next = !muted
    setMuted(next)
    audio.current?.setMuted(next)
    try { if (next) localStorage.setItem(MUTE_KEY, '1'); else localStorage.removeItem(MUTE_KEY) } catch { /* private mode */ }
  }
  const streakNow = run?.streak ?? 0
  useEffect(() => {
    audio.current?.setMood(!playing ? 'lobby' : golden ? 'golden' : streakNow >= 10 ? 'fire' : streakNow >= 5 ? 'combo' : 'play', streakNow)
  }, [playing, golden, streakNow, sound])

  // ---- the run ----
  const q = playing ? run!.question! : null
  const left = q ? Math.max(0, q.deadline - serverNow) : 0

  // Last three seconds tick.
  useEffect(() => {
    if (!q) { lastTick.current = null; return }
    const sec = Math.ceil(left / 1000)
    if (left > 0 && sec <= 3 && lastTick.current !== sec) { lastTick.current = sec; audio.current?.tick() }
  }, [q, left])

  const finishRun = useCallback((r: StreakRunView, wasBest: boolean) => {
    setRun(r)
    if (wasBest) audio.current?.best(); else audio.current?.over()
    void loadHome().catch(() => undefined)
    void loadBoard()
  }, [loadHome, loadBoard])

  const settle = useCallback((res: { result: Result | null; run: StreakRunView }, choice: number | null, best: boolean) => {
    const { result, run: next } = res
    if (result?.correct) {
      const before = multiplier(next.streak - 1)
      audio.current?.correct(next.streak)
      if (multiplier(next.streak) > before) { audio.current?.combo(); setToast(`🔥 ${next.streak} in a row! Points ×${multiplier(next.streak)}`) }
      setFloat({ key: Date.now(), text: `+${num(result.points)}`, golden: result.golden })
      setGlow((g) => g + 1)
    }
    if (next.question) setSkew(next.question.serverNow - Date.now())
    if (next.finished) {
      if (result && !result.correct) {
        audio.current?.wrong()
        setShake((s) => s + 1)
        // Show the right answer for a moment before the results.
        setReveal({ run: run!, choice, correctChoice: result.correctChoice })
        window.setTimeout(() => { setReveal(null); finishRun(next, best) }, 1500)
        return
      }
      finishRun(next, best)
      return
    }
    setRun(next)
  }, [run, finishRun])

  const begin = async () => {
    if (lock.current) return
    ensureAudio()
    lock.current = true; setBusy(true); setError(null)
    try {
      const r = await request<StreakRunView>('/api/streak/start', {})
      setBestThisRun(false); setReveal(null); setFloat(null)
      if (r.question) setSkew(r.question.serverNow - Date.now())
      setRun(r)
      audio.current?.go()
    } catch (e) {
      setError(responseMessage(e))
      if (e instanceof ApiError && ['needs_flowstate', 'no_runs', 'streak_closed', 'streak_soon'].includes(e.code ?? '')) void loadHome().catch(() => undefined)
    } finally { lock.current = false; setBusy(false) }
  }

  const choose = useCallback(async (choice: number) => {
    if (lock.current || !run || !q) return
    lock.current = true; setBusy(true); setPicked(choice); setError(null)
    try {
      const res = await request<{ result: Result | null; run: StreakRunView }>('/api/streak/answer', { runId: run.runId, index: q.index, choice })
      const best = bestThisRun || Boolean(res.result?.newBest)
      if (res.result?.newBest) setBestThisRun(true)
      settle(res, choice, best)
    } catch (e) { setError(responseMessage(e)) }
    finally { lock.current = false; setBusy(false); setPicked(null) }
  }, [run, q, bestThisRun, settle])

  // Out of time: tell the server. If this phone's clock ran ahead, the server says "not yet"; ask again.
  useEffect(() => {
    if (!q || left > 0 || !run) return
    let stop = false
    const expire = async (attempt: number) => {
      if (stop || lock.current) { if (!stop && attempt < 20) window.setTimeout(() => void expire(attempt + 1), 300); return }
      lock.current = true
      try {
        const res = await request<{ result: Result | null; run: StreakRunView }>('/api/streak/answer', { runId: run.runId, index: q.index, timeout: true })
        if (res.result || res.run.finished || res.run.question?.index !== q.index) {
          if (res.result) { audio.current?.wrong(); setShake((s) => s + 1); setReveal({ run, choice: null, correctChoice: res.result.correctChoice }); window.setTimeout(() => { setReveal(null); finishRun(res.run, bestThisRun) }, 1500) }
          else if (res.run.finished) finishRun(res.run, bestThisRun)
          else setRun(res.run)
        } else if (!stop && attempt < 20) window.setTimeout(() => void expire(attempt + 1), 400)
      } catch (e) { setError(responseMessage(e)) }
      finally { lock.current = false }
    }
    void expire(0)
    return () => { stop = true }
  }, [q, left, run, bestThisRun, finishRun])

  // Desktop: 1/2 or ←/→.
  useEffect(() => {
    if (!q) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '1' || e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') void choose(0)
      if (e.key === '2' || e.key === 'ArrowRight' || e.key.toLowerCase() === 'b') void choose(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [q, choose])

  // ---- screens ----
  if (!home) {
    return <Shell sound={sound} muted={muted} onSound={toggleSound}><div className="app-card p-6"><p role="status" className="text-sm font-semibold text-ink/55">{error ?? 'Loading Jara Streak…'}</p></div></Shell>
  }
  const { event } = home
  const runsLeft = home.runs?.left ?? 0
  const canPlay = event.phase === 'open' && home.connected && !home.playedElsewhere && home.supported

  return (
    <Shell sound={sound} muted={muted} onSound={toggleSound}>
      {toast && <div role="status" className="streak-rise fixed top-4 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl bg-ink px-4 py-3 text-center text-sm font-bold text-cream shadow-xl">{toast}</div>}

      {reveal ? (
        <PlayCard run={reveal.run} left={0} busy picked={reveal.choice} reveal={reveal} golden={false} float={null} shake={shake} glow={glow} onChoose={() => undefined} />
      ) : playing && q ? (
        <PlayCard run={run!} left={left} busy={busy} picked={picked} reveal={null} golden={Boolean(golden)} float={float} shake={shake} glow={glow} onChoose={(c) => void choose(c)} />
      ) : (
        <>
          {run?.finished && event.phase !== 'off' && (
            <GameOver run={run} best={bestThisRun} home={home} board={board} busy={busy} onAgain={() => void begin()} />
          )}

          <Hero home={home} serverNow={serverNow} golden={Boolean(golden)} busy={busy} canPlay={canPlay} runsLeft={runsLeft} showPlay={!run?.finished} onPlay={() => void begin()} />

          {error && <p role="alert" className="rounded-xl bg-[#fde8e2] p-3 text-sm font-semibold text-[#8a2a12]">{error}</p>}

          <Setup home={home} onSaved={(h) => setHome(h)} onError={setError} />

          {(event.phase === 'open' || event.phase === 'closed') && board && <Leaderboard board={board} />}

          {event.phase !== 'closed' && home.connected && !home.playedElsewhere && <InviteCard home={home} />}

          {event.phase !== 'closed' && <Rules home={home} />}

          {event.phase === 'soon' && board && board.players === 0 && (
            <section className="app-card p-5 text-center sm:p-6">
              <p className="text-3xl">🏆</p>
              <p className="mt-2 font-bold">The leaderboard goes live when the bounty starts.</p>
              <p className="mt-1 text-sm text-ink/55">Invite your friends now. Every friend who joins and verifies before then gives you extra runs.</p>
            </section>
          )}
        </>
      )}
    </Shell>
  )
}

// ---- pieces ----

function Shell({ children, sound, muted, onSound }: { children: React.ReactNode; sound: boolean; muted: boolean; onSound: () => void }) {
  const on = sound && !muted
  return (
    <div className="jara-app min-h-dvh text-ink">
      <header className="flex min-h-20 items-center justify-between gap-3 border-b border-forest/10 bg-white px-5 py-4 sm:px-10">
        <Link href="/app" className="text-xl font-black tracking-tight">jara<span className="text-mandarin">.</span> <span className="ml-2 text-sm font-medium text-forest/70">Jara Streak</span></Link>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onSound} aria-pressed={on} aria-label={on ? 'Turn music off' : 'Turn music on'} className="app-button-secondary text-xs">
            <span aria-hidden>{on ? '🔊' : '🔇'}</span> <span className="hidden sm:inline">{on ? 'Music on' : 'Music off'}</span>
          </button>
          <Link href="/app" className="app-button-secondary text-xs">Back to Jara</Link>
        </div>
      </header>
      <main className="mx-auto grid max-w-xl gap-5 px-4 py-6 sm:py-8">{children}</main>
    </div>
  )
}

function Countdown({ ms }: { ms: number }) {
  const p = parts(ms)
  const box = (value: number, label: string) => (
    <div className="grid min-w-16 place-items-center rounded-2xl bg-cream/10 px-3 py-2.5 ring-1 ring-cream/15">
      <span className="text-3xl leading-none font-bold tabular-nums">{String(value).padStart(2, '0')}</span>
      <span className="mt-1 text-[10px] font-bold tracking-[0.14em] text-cream/60 uppercase">{label}</span>
    </div>
  )
  return <div className="mt-5 flex gap-2" aria-label={`Starts in ${p.d} days ${p.h} hours ${p.m} minutes`}>{box(p.d, 'days')}{box(p.h, 'hrs')}{box(p.m, 'min')}{box(p.s, 'sec')}</div>
}

function Hero({ home, serverNow, golden, busy, canPlay, runsLeft, showPlay, onPlay }: { home: StreakHome; serverNow: number; golden: boolean; busy: boolean; canPlay: boolean; runsLeft: number; showPlay: boolean; onPlay: () => void }) {
  const { event } = home
  const prize = `Top ${event.winners} win ${naira(event.prizeNgn)} each`
  if (event.phase === 'off') {
    return (
      <section className="app-card p-6">
        <h1 className="text-2xl font-bold">Jara Streak</h1>
        <p className="mt-2 text-ink/65">The campus bounty isn’t open yet. Watch Jara’s socials for the date.</p>
      </section>
    )
  }
  const tease = event.golden.startsAt && !event.golden.live ? event.golden.startsAt - serverNow : null
  return (
    <section className="overflow-hidden rounded-[22px] bg-forest text-cream">
      {golden && event.golden.endsAt && (
        <div className="flex items-center justify-between gap-3 bg-crest px-5 py-2.5 text-sm font-bold text-ink sm:px-6">
          <span>⚡ Golden Hour: every point counts double</span>
          <span className="tabular-nums">{shortLeft(event.golden.endsAt - serverNow)}</span>
        </div>
      )}
      {!golden && tease !== null && tease > 0 && (
        <div className="bg-crest/90 px-5 py-2.5 text-sm font-bold text-ink sm:px-6">⚡ Golden Hour starts in {shortLeft(tease)}. Get ready!</div>
      )}
      <div className="p-5 sm:p-6">
        <p className="text-[11px] font-bold tracking-[0.14em] text-crest uppercase">
          {event.phase === 'open' ? <><span className="streak-live mr-1.5 inline-block h-2 w-2 rounded-full bg-mandarin align-middle" />Live · ends in {shortLeft((event.endAt ?? 0) - serverNow)}</>
            : event.phase === 'soon' ? `Campus bounty · starts ${event.startAt ? when(event.startAt) : 'soon'}`
            : 'Campus bounty · ended'}
        </p>
        <h1 className="mt-1 text-[34px] leading-tight font-bold tracking-[-0.04em]">Jara Streak <span className="streak-flame">🔥</span></h1>
        <p className="mt-1 text-cream/80">How many can you get right in a row?</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-mandarin px-3 py-1.5 text-white">🏆 {prize}</span>
          <span className="rounded-full bg-cream/10 px-3 py-1.5 ring-1 ring-cream/20">Free to play</span>
          {home.campus && <span className="rounded-full bg-cream/10 px-3 py-1.5 ring-1 ring-cream/20">🎓 {home.campus}</span>}
        </div>

        {event.phase === 'soon' && event.startAt && <Countdown ms={event.startAt - serverNow} />}

        {event.phase === 'open' && home.best && home.best.score > 0 && (
          <p className="mt-4 text-sm font-semibold text-cream/80">Your best: <b className="text-cream">{num(home.best.score)} pts</b> · 🔥 {home.best.streak} in a row</p>
        )}

        {event.phase === 'open' && canPlay && showPlay && (
          <div className="mt-5">
            <button onClick={onPlay} disabled={busy || runsLeft <= 0} className="app-button min-h-14 w-full justify-center bg-mandarin text-base text-white hover:bg-mandarin-deep disabled:opacity-60">
              {busy ? 'Starting…' : runsLeft > 0 ? (home.best?.runs ? 'Play again' : 'Start playing') : 'No runs left today'}
            </button>
            <RunDots home={home} />
          </div>
        )}
        {event.phase === 'closed' && <p className="mt-4 text-sm font-semibold text-cream/80">Thanks for playing! The final leaderboard is below. Winners get their prize in their wallet automatically.</p>}
      </div>
    </section>
  )
}

function RunDots({ home }: { home: StreakHome }) {
  const r = home.runs
  if (!r) return null
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs font-semibold text-cream/75">
      <span className="flex gap-1" aria-label={`${r.freeLeft} of ${r.perDay} daily runs left`}>
        {Array.from({ length: r.perDay }, (_, i) => <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < r.freeLeft ? 'bg-crest' : 'bg-cream/20'}`} />)}
      </span>
      <span>{r.freeLeft} of {r.perDay} runs left today{r.bonusLeft > 0 ? ` · +${r.bonusLeft} invite run${r.bonusLeft === 1 ? '' : 's'}` : ''}</span>
    </div>
  )
}

function PlayCard({ run, left, busy, picked, reveal, golden, float, shake, glow, onChoose }: {
  run: StreakRunView; left: number; busy: boolean; picked: number | null; reveal: Reveal | null; golden: boolean
  float: { key: number; text: string; golden: boolean } | null; shake: number; glow: number; onChoose: (choice: number) => void
}) {
  const q = run.question!
  const pct = Math.max(0, Math.min(100, (left / q.limitMs) * 100))
  const urgent = left < 2_500
  const combo = multiplier(run.streak + 1)
  return (
    <section key={`shake-${shake}`} className={`app-card relative overflow-hidden p-5 sm:p-6 ${reveal ? 'streak-shake' : ''} ${golden ? 'ring-2 ring-crest' : ''}`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.14em] text-ink/45 uppercase">Score</p>
          <p key={`glow-${glow}`} className="streak-glow rounded-lg text-3xl leading-none font-bold tabular-nums">{num(run.score)}</p>
        </div>
        <div className="flex items-center gap-2">
          {golden && <span className="rounded-full bg-crest px-2.5 py-1 text-xs font-bold text-ink">⚡ ×2</span>}
          {combo > 1 && <span className="rounded-full bg-mandarin px-2.5 py-1 text-xs font-bold text-white">×{combo} combo</span>}
          <span className="flex items-center gap-1 rounded-full bg-forest px-3 py-1 text-sm font-bold text-cream"><span className={run.streak > 0 ? 'streak-flame' : ''}>🔥</span> {run.streak}</span>
        </div>
      </div>

      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-ink/10" aria-hidden>
        <div className={`h-full rounded-full transition-[width] duration-100 ease-linear ${urgent ? 'bg-mandarin' : 'bg-forest'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`mt-1 text-right text-xs font-bold tabular-nums ${urgent ? 'text-mandarin' : 'text-ink/50'}`} aria-live="polite">{(left / 1000).toFixed(1)}s</p>

      {float && <span key={float.key} className={`streak-float pointer-events-none absolute top-16 left-1/2 rounded-full px-3 py-1 text-lg font-black ${float.golden ? 'bg-crest text-ink' : 'bg-[#e9f3e4] text-forest'}`}>{float.text}</span>}

      <p className="mt-2 text-[11px] font-bold tracking-[0.14em] text-forest/60 uppercase">{q.topic}</p>
      <h2 className="mt-1 min-h-16 text-2xl leading-snug font-bold tracking-tight">{q.prompt}</h2>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {q.options.map((o, i) => {
          const right = reveal && reveal.correctChoice === i
          const wrong = reveal && reveal.choice === i && reveal.correctChoice !== i
          const tone = right ? 'border-forest bg-[#e9f3e4] text-forest' : wrong ? 'border-[#c2410c] bg-[#fdebe4] text-[#8a2a12]' : picked === i ? 'border-forest/60 bg-[#f3f7ef]' : 'border-ink/12 bg-white hover:border-forest/40 hover:bg-[#f3f7ef]'
          return (
            <button key={`${q.index}-${i}`} disabled={busy || left <= 0} onClick={() => onChoose(i)}
              className={`flex min-h-20 items-center gap-3 rounded-2xl border-2 px-4 py-4 text-left text-lg font-bold transition active:scale-[0.98] disabled:cursor-default ${tone}`}>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-forest/10 text-sm text-forest">{right ? '✓' : wrong ? '✕' : i + 1}</span>
              <span className="min-w-0">{o}</span>
            </button>
          )
        })}
      </div>
      {reveal && <p className="mt-4 text-center text-sm font-bold text-[#8a2a12]">{reveal.choice === null ? '⏰ Time’s up!' : 'Not this time!'}</p>}
    </section>
  )
}

function GameOver({ run, best, home, board, busy, onAgain }: { run: StreakRunView; best: boolean; home: StreakHome; board: StreakBoard | null; busy: boolean; onAgain: () => void }) {
  const you = board?.you
  const runsLeft = home.runs?.left ?? 0
  const title = run.ended === 'timeout' ? '⏰ Time’s up!' : run.ended === 'wrong' ? 'Run over!' : run.ended === 'cleared' ? '🤯 You answered every question!' : run.ended === 'closed' ? 'The bounty has ended' : 'Run over'
  const share = `🔥 I just hit a ${run.streak} streak (${num(run.score)} pts) on Jara Streak! Top ${home.event.winners} win ${naira(home.event.prizeNgn)} each. Beat me 👉 ${home.inviteLink ?? ''}`
  return (
    <section className="app-card streak-rise overflow-hidden">
      <div className="bg-[#f4f5ef] px-5 py-5 text-center sm:px-6">
        <p className="text-sm font-bold text-ink/60">{title}</p>
        <p className="mt-2 text-5xl leading-none font-bold tracking-tight tabular-nums">{num(run.score)}</p>
        <p className="mt-1 text-sm font-semibold text-ink/55">points · 🔥 {run.streak} in a row</p>
        {best && run.score > 0 ? <p className="mt-3 inline-block rounded-full bg-crest px-3 py-1 text-sm font-bold">🎉 New personal best!</p>
          : home.best && home.best.score > 0 && <p className="mt-3 text-sm font-semibold text-ink/60">Your best: {num(home.best.score)} pts</p>}
        {you?.rank && (
          <p className="mt-3 text-sm font-bold text-forest">
            {you.rank <= home.event.winners ? `${MEDALS[you.rank - 1] ?? '🏆'} You’re #${you.rank}: in the prize zone! Hold on to it.` : `You’re #${you.rank}${you.toPodium ? `, ${num(you.toPodium)} points from the top ${home.event.winners}` : ''}.`}
          </p>
        )}
      </div>
      <div className="grid gap-2.5 p-5 sm:px-6">
        {home.event.phase === 'open' && (
          <button onClick={onAgain} disabled={busy || runsLeft <= 0} className="app-button min-h-12 justify-center bg-mandarin text-sm text-white hover:bg-mandarin-deep disabled:opacity-60">
            {busy ? 'Starting…' : runsLeft > 0 ? `Play again · ${runsLeft} run${runsLeft === 1 ? '' : 's'} left` : 'No runs left today. Invite a friend for more'}
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <a href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer" className="app-button-secondary justify-center text-sm">Share on WhatsApp</a>
          <ShareButton text={share} />
        </div>
      </div>
    </section>
  )
}

function ShareButton({ text, label = 'Share' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  const share = async () => {
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> }
    if (nav.share) { await nav.share({ text }).catch(() => undefined); return }
    await navigator.clipboard?.writeText(text).then(() => setDone(true), () => undefined)
  }
  return <button type="button" onClick={() => void share()} className="app-button-secondary justify-center text-sm">{done ? 'Copied!' : label}</button>
}

function Setup({ home, onSaved, onError }: { home: StreakHome; onSaved: (h: StreakHome) => void; onError: (e: string | null) => void }) {
  const [campus, setCampus] = useState('')
  const [saving, setSaving] = useState(false)
  const { event } = home
  if (event.phase === 'closed' || event.phase === 'off') return null
  if (!home.signedIn || !home.connected) {
    return (
      <section className="app-card p-5 sm:p-6">
        <h2 className="text-lg font-bold">{home.signedIn ? 'Verify your GoodDollar wallet to play' : 'Join Jara to play'}</h2>
        <p className="mt-1 text-sm text-ink/60">One player per real person: you play with your verified GoodDollar wallet, and that’s where your prize lands if you win.</p>
        <Link href="/app" className="app-button mt-4 w-full justify-center bg-forest text-cream hover:bg-forest-soft min-h-12 text-sm">{home.signedIn ? 'Finish setting up →' : 'Get started on Jara →'}</Link>
      </section>
    )
  }
  if (home.playedElsewhere) {
    return <section className="app-card p-5 sm:p-6"><p className="font-bold">This GoodDollar identity already plays from another Jara account. Open Jara there to play.</p></section>
  }
  if (!home.supported) {
    return (
      <section className="app-card p-5 sm:p-6">
        <h2 className="text-lg font-bold">One step: vote for Jara on Flowstate</h2>
        <p className="mt-1 text-sm text-ink/60">Give Jara at least one of your GoodBuilders votes. It’s free: Jara covers the network fee. Then come back and play.</p>
        <Link href="/app#vote" className="app-button mt-4 w-full justify-center bg-forest text-cream hover:bg-forest-soft min-h-12 text-sm">Vote for Jara →</Link>
      </section>
    )
  }
  if (home.campus) return null
  const save = async () => {
    if (!campus) return
    setSaving(true); onError(null)
    try { onSaved(await request<StreakHome>('/api/streak/campus', { campus })) }
    catch (e) { onError(responseMessage(e)) }
    finally { setSaving(false) }
  }
  return (
    <section className="app-card p-5 sm:p-6">
      <h2 className="text-lg font-bold">🎓 Rep your campus</h2>
      <p className="mt-1 text-sm text-ink/60">Your points also count for your school on the campus leaderboard. You can only pick once.</p>
      <div className="mt-4 flex gap-2">
        <select value={campus} onChange={(e) => setCampus(e.target.value)} aria-label="Your campus" className="min-h-12 min-w-0 flex-1 rounded-xl border border-forest/20 bg-white px-3 font-semibold">
          <option value="">Choose your campus…</option>
          {CAMPUSES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={() => void save()} disabled={!campus || saving} className="app-button justify-center bg-forest text-cream hover:bg-forest-soft disabled:opacity-60 min-h-12 text-sm">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </section>
  )
}

function Leaderboard({ board }: { board: StreakBoard }) {
  const [tab, setTab] = useState<'players' | 'campuses'>('players')
  const tabClass = (t: string) => `rounded-full px-3 py-1.5 text-xs font-bold ${tab === t ? 'bg-forest text-cream' : 'text-ink/60 hover:bg-ink/5'}`
  const inTop = board.top.some((p) => p.you)
  return (
    <section className="app-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Leaderboard</h2>
          <p className="text-xs font-semibold text-ink/50">{num(board.players)} player{board.players === 1 ? '' : 's'}{board.phase === 'open' ? ' · updates live' : ''}</p>
        </div>
        <div className="flex gap-1 rounded-full bg-[#f4f5ef] p-1">
          <button className={tabClass('players')} onClick={() => setTab('players')}>Players</button>
          <button className={tabClass('campuses')} onClick={() => setTab('campuses')}>Campuses</button>
        </div>
      </div>

      {tab === 'players' ? (
        board.top.length === 0 ? <p className="mt-4 rounded-xl bg-[#f7f8f2] p-4 text-center text-sm font-semibold text-ink/55">No scores yet. The first run takes #1 🥇</p> : (
          <ol className="mt-4 grid gap-1.5">
            {board.top.map((p) => {
              const prize = p.rank <= board.winners
              return (
                <li key={p.rank} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${p.you ? 'bg-[#e9f3e4] ring-1 ring-forest/30' : prize ? 'bg-[#fff6e0]' : 'odd:bg-[#f7f8f2]'}`}>
                  <span className="w-7 shrink-0 text-center text-base font-bold">{MEDALS[p.rank - 1] ?? <span className="text-sm text-ink/45">#{p.rank}</span>}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{p.name}{p.you ? ' (you)' : ''}</span>
                    <span className="block truncate text-[11px] font-semibold text-ink/45">{p.campus ?? p.wallet} · 🔥 {p.streak}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-bold tabular-nums">{num(p.score)}</span>
                    {prize && <span className="block text-[11px] font-bold text-mandarin">{naira(board.prizeNgn)}</span>}
                  </span>
                </li>
              )
            })}
          </ol>
        )
      ) : (
        board.campuses.length === 0 ? <p className="mt-4 rounded-xl bg-[#f7f8f2] p-4 text-center text-sm font-semibold text-ink/55">No campus on the board yet. Pick yours and put it there.</p> : (
          <ol className="mt-4 grid gap-1.5">
            {board.campuses.map((c) => (
              <li key={c.campus} className="flex items-center gap-3 rounded-xl px-3 py-2.5 odd:bg-[#f7f8f2]">
                <span className="w-7 shrink-0 text-center font-bold">{MEDALS[c.rank - 1] ?? <span className="text-sm text-ink/45">#{c.rank}</span>}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{c.campus} <span className="font-semibold text-ink/45">· {c.players} player{c.players === 1 ? '' : 's'}</span></span>
                <span className="shrink-0 text-sm font-bold tabular-nums">{num(c.score)}</span>
              </li>
            ))}
          </ol>
        )
      )}

      {tab === 'players' && board.you?.rank && !inTop && (
        <p className="mt-3 rounded-xl bg-[#e9f3e4] px-3 py-2.5 text-sm font-bold">You’re #{board.you.rank} · {num(board.you.score)} pts{board.you.toPodium ? ` · ${num(board.you.toPodium)} to the top ${board.winners}` : ''}</p>
      )}
      <p className="mt-3 text-xs font-semibold text-ink/50">
        {board.phase === 'closed'
          ? board.prizes.length ? (board.prizes.every((p) => p.paid) ? `🏆 Prizes sent: G$ ${num(board.prizes[0].amountGd)} (≈ ${naira(board.prizeNgn)}) to each winner’s wallet.` : 'Winners are confirmed. Prizes are on their way to their wallets.') : 'Final scores. Prizes go out shortly.'
          : `Your best run counts. The top ${board.winners} when the bounty ends each get ${naira(board.prizeNgn)} in G$.`}
      </p>
    </section>
  )
}

function InviteCard({ home }: { home: StreakHome }) {
  const [copied, setCopied] = useState(false)
  const r = home.runs
  if (!home.inviteLink) return null
  const text = `Jara Streak 🔥 How many can you get right in a row? Top ${home.event.winners} win ${naira(home.event.prizeNgn)} each. Join with my link: ${home.inviteLink}`
  const maxed = r ? r.friendRuns >= r.maxFriendRuns : false
  return (
    <section className="app-card p-5 sm:p-6">
      <h2 className="text-lg font-bold">Want more runs? Bring your friends</h2>
      <p className="mt-1 text-sm text-ink/60">
        Every friend who joins Jara with your link and verifies gives you <b className="text-ink">+{home.event.runsPerFriend} runs</b>{r ? ` (up to ${r.maxFriendRuns})` : ''}.
      </p>
      {r && r.friends > 0 && <p className="mt-2 text-sm font-bold text-forest">✓ {r.friends} friend{r.friends === 1 ? '' : 's'} joined · {r.friendRuns} bonus runs earned{maxed ? ' (max)' : ''}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="app-button justify-center bg-forest text-cream hover:bg-forest-soft text-sm">WhatsApp</a>
        <button type="button" onClick={() => navigator.clipboard?.writeText(home.inviteLink!).then(() => setCopied(true), () => undefined)} className="app-button-secondary justify-center text-sm">{copied ? 'Link copied!' : 'Copy my link'}</button>
      </div>
    </section>
  )
}

function Rules({ home }: { home: StreakHome }) {
  const { event } = home
  const rows: [string, React.ReactNode][] = [
    ['👆', <>Two answers, one is right. Tap fast: you get <b>7 seconds</b>, and it gets shorter as your streak grows.</>],
    ['💥', <>One wrong answer, or running out of time, ends your run.</>],
    ['🔥', <>Combos: <b>5 in a row ×2</b>, 10 in a row ×3, 20 in a row ×4. Faster answers score more.</>],
    ['🎯', <><b>{event.runsPerDay} runs a day</b> (resets at midnight). Only your best run counts on the leaderboard.</>],
    ['⚡', <><b>Golden Hours</b>: surprise windows when every point counts double. Follow Jara’s socials so you don’t miss them.</>],
    ['🏆', <>When it ends{event.endAt ? ` (${when(event.endAt - 60_000)})` : ''}, the <b>top {event.winners}</b> each get <b>{naira(event.prizeNgn)} in G$</b>, sent straight to their wallet. Buy airtime or data in Jara, or cash out to your bank.</>],
  ]
  return (
    <section className="app-card p-5 sm:p-6">
      <h2 className="text-lg font-bold">How it works</h2>
      <ul className="mt-3 grid gap-3">
        {rows.map(([icon, text], i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink/75"><span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#f4f5ef]">{icon}</span><span>{text}</span></li>
        ))}
      </ul>
      <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-ink/50"><Icon name="check" className="h-3.5 w-3.5" strokeWidth={3} /> One player per verified person. Fair play: the clock runs on Jara’s server.</p>
    </section>
  )
}
