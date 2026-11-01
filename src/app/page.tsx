import Link from 'next/link'
import { Jar } from '@/components/Jar'
import { botLink } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

const WEEK = [
  { day: 'Mon', icon: '☀️', title: 'Claimed G$ for you', body: 'Light jar 40% · Data 80% · Airtime 65%', tone: 'cream' },
  { day: 'Tue', icon: '💬', title: '"Buy 1GB for my mama"', body: 'Sent in 10 seconds. Paid from the Data jar.', tone: 'mandarin' },
  { day: 'Wed', icon: '🧰', title: 'Found you a gig', body: 'Translate 20 phrases into Hausa — G$ 4,000. Done by evening.', tone: 'cream' },
  { day: 'Thu', icon: '💡', title: 'Light jar hit ₦3,000', body: 'Auto-paid. Meter token sent to your chat.', tone: 'crest' },
  { day: 'Fri', icon: '⭐', title: 'Reward collected', body: 'First bill paid with G$ — +G$ 300 bonus, no forms.', tone: 'cream' },
  { day: 'Sat', icon: '🔥', title: '7-day streak bonus', body: 'Extra G$ dropped in for showing up all week.', tone: 'forest' },
  { day: 'Sun', icon: '📊', title: 'Your weekly wrap', body: '4 bills paid with G$. ₦600 you didn’t spend.', tone: 'mandarin' },
] as const

const TONE: Record<string, string> = {
  cream: 'bg-cream text-ink',
  mandarin: 'bg-mandarin text-ink',
  crest: 'bg-crest text-ink',
  forest: 'bg-forest text-cream',
}

export default function Home() {
  const tg = botLink()
  return (
    <main className="overflow-x-hidden">
      {/* NAV */}
      <header className="bg-forest">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-cream">
            <span className="grid h-10 w-10 place-items-center rounded-xl border-[3px] border-ink bg-crest text-xl shadow-chunk-sm">🫙</span>
            <span className="text-2xl font-extrabold tracking-tight">Jarra</span>
          </Link>
          <Link href="/app" className="press rounded-full border-[3px] border-ink bg-mandarin px-5 py-2 font-bold text-ink shadow-chunk-sm">
            Open Jarra
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden border-b-[4px] border-ink bg-forest text-cream">
        <div className="mx-auto max-w-7xl px-4 pt-8 pb-16 sm:px-6 lg:pt-12 lg:pb-20">
          <p className="inline-flex items-center gap-2 rounded-full border-[3px] border-ink bg-crest px-4 py-1.5 text-sm font-extrabold text-ink uppercase shadow-chunk-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-mandarin" /> Powered by GoodDollar · Built on Celo
          </p>

          <div className="relative mt-6">
            <h1 className="relative z-10 text-[clamp(3.6rem,13.5vw,11.5rem)] leading-[0.82] font-extrabold tracking-[-0.055em] uppercase">
              <span className="mb-[0.18em] flex items-center gap-[0.25em] text-[0.36em] leading-none tracking-[-0.03em] text-crest">
                Meet your AI agent
                <span className="inline-block h-[0.14em] w-[1.6em] rounded-full bg-mandarin" />
              </span>
              <span className="block">Your free</span>
              <span className="block">
                <span className="text-crest">G$</span> pays
              </span>
              <span className="block">
                your{' '}
                <span className="relative mt-3 inline-block -rotate-3 rounded-[0.18em] border-[5px] border-ink bg-mandarin px-[0.12em] pt-[0.04em] pb-[0.1em] text-ink shadow-[10px_10px_0_0_#0b1f16]">
                  bills.
                </span>
              </span>
            </h1>

          </div>

          <div className="mt-12 grid items-end gap-12 lg:mt-14 lg:grid-cols-[1fr_440px]">
            <div>
              <p className="max-w-2xl text-xl leading-snug font-semibold text-cream/90 sm:text-2xl">
                Jarra is an <span className="rounded-md bg-crest px-1.5 text-ink">AI agent</span> that quietly works for you. It saves your free GoodDollar,{' '}
                <span className="text-crest">pays your bills, finds you rewards and finds you paid work</span> — all in G$.
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <a
                  href={tg ?? '/app'}
                  className="press inline-flex items-center justify-center gap-2 rounded-2xl border-[4px] border-ink bg-mandarin px-8 py-5 text-xl font-extrabold text-ink uppercase shadow-chunk-lg"
                >
                  Start on Telegram →
                </a>
                <Link
                  href="/app"
                  className="press inline-flex items-center justify-center rounded-2xl border-[4px] border-ink bg-cream px-8 py-5 text-xl font-extrabold text-ink uppercase shadow-chunk-lg"
                >
                  Use it in your browser
                </Link>
              </div>
              <p className="mt-5 text-sm font-bold tracking-wide text-cream/60 uppercase">Works on any phone · No crypto talk · No gas</p>
            </div>

            <div className="relative mx-auto w-full max-w-[440px]">
              <div className="grid grid-cols-3 items-end gap-4 px-3">
                <div className="animate-bob" style={{ animationDelay: '0s' }}>
                  <Jar pct={72} color="crest" lid="#ff6b00" className="h-48 sm:h-52" label={{ icon: 'bolt', text: 'Light' }} />
                </div>
                <div className="animate-bob" style={{ animationDelay: '0.4s' }}>
                  <Jar pct={45} color="mandarin" className="h-56 sm:h-60" label={{ icon: 'signal', text: 'Data' }} />
                </div>
                <div className="animate-bob" style={{ animationDelay: '0.8s' }}>
                  <Jar pct={90} color="crest" lid="#ff6b00" className="h-44 sm:h-48" label={{ icon: 'phone', text: 'Airtime' }} />
                </div>
              </div>
              <div className="h-5 rounded-lg border-[4px] border-ink bg-crest shadow-chunk" />
              <div className="relative -mt-3 mr-[-8px] ml-auto w-[88%] rotate-2 rounded-3xl rounded-br-md border-[4px] border-ink bg-cream p-5 text-ink shadow-chunk-lg">
                <p className="text-sm font-extrabold text-forest uppercase">🤖 Jarra AI agent · 7:02am</p>
                <p className="mt-1 text-lg leading-snug font-bold">Light jar don full 🎉 I&apos;ve paid ₦3,000 for your meter.</p>
                <p className="mt-2 rounded-xl bg-crest px-3 py-1.5 font-mono text-sm font-bold">4021 7781 0093 2215 6650</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW */}
      <section className="grain bg-cream py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="max-w-2xl text-4xl leading-none font-extrabold tracking-tight sm:text-6xl">
            One AI agent. <span className="text-mandarin">Four jobs.</span> G$ drives all of them.
          </h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: '01', t: 'Saves', d: 'Claims your free G$ every day and splits it into jars for Light, Data and Airtime.', c: 'bg-crest' },
              { n: '02', t: 'Pays', d: 'Knows when each bill comes round, tops the jar up in time and pays — then sends proof.', c: 'bg-mandarin' },
              { n: '03', t: 'Finds rewards', d: 'Streaks, first bills, invites, weekly saving — Jarra spots G$ bonuses and collects them.', c: 'bg-cream' },
              { n: '04', t: 'Finds work', d: 'Matches small gigs to your skills and city — surveys, translation, photos — paid in G$.', c: 'bg-forest text-cream' },
            ].map((s) => (
              <div key={s.n} className={`press rounded-3xl border-[3px] border-ink p-7 shadow-chunk-lg ${s.c}`}>
                <p className="text-5xl font-extrabold opacity-90">{s.n}</p>
                <p className="mt-6 text-2xl font-extrabold">{s.t}</p>
                <p className="mt-3 text-lg leading-relaxed font-medium opacity-90">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WEEK */}
      <section className="bg-mandarin py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <h2 className="text-4xl leading-none font-extrabold tracking-tight text-ink sm:text-6xl">A week with Jarra.</h2>
            <p className="max-w-sm text-lg font-semibold text-ink/80">Claims, payments and bonuses are real G$ transactions on Celo — small, daily, useful.</p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WEEK.map((w, i) => (
              <div
                key={w.day}
                className={`press rounded-3xl border-[3px] border-ink p-5 shadow-chunk ${TONE[w.tone === 'mandarin' ? 'crest' : w.tone]} ${i === 0 ? 'lg:col-span-2' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-full border-[3px] border-ink bg-cream px-3 py-0.5 text-sm font-extrabold text-ink">{w.day}</span>
                  <span className="text-3xl">{w.icon}</span>
                </div>
                <p className="mt-5 text-xl leading-tight font-extrabold">{w.title}</p>
                <p className="mt-2 font-medium opacity-80">{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CHAT */}
      <section className="bg-forest py-20 text-cream">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-4xl leading-none font-extrabold tracking-tight sm:text-6xl">
              Talk to it like <span className="text-crest">your person.</span>
            </h2>
            <p className="mt-6 max-w-lg text-lg text-cream/80">
              Jarra is an AI agent that understands English and Pidgin. It works out what you mean, shows you exactly what it&apos;s about to pay, and waits for your “yes”.
            </p>
          </div>
          <div className="space-y-3 rounded-[2rem] border-[3px] border-ink bg-cream p-5 text-ink shadow-chunk-lg">
            <Bubble me>Abeg send ₦500 airtime to my mama 0803 555 1234</Bubble>
            <Bubble>₦500 MTN airtime to 0803 555 1234 — G$ from your Airtime jar. Make I send am?</Bubble>
            <div className="flex gap-2 pl-1">
              <span className="rounded-xl border-[3px] border-ink bg-mandarin px-4 py-2 font-extrabold shadow-chunk-sm">✅ Pay it</span>
              <span className="rounded-xl border-[3px] border-ink bg-cream px-4 py-2 font-extrabold shadow-chunk-sm">✖ Cancel</span>
            </div>
            <Bubble>Done ✅ Mama don get am. Airtime jar still dey 60%.</Bubble>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-crest py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h2 className="text-5xl leading-[0.95] font-extrabold tracking-tight text-ink sm:text-7xl">Let your G$ do the boring part.</h2>
          <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
            <a href={tg ?? '/app'} className="press rounded-2xl border-[3px] border-ink bg-mandarin px-8 py-4 text-lg font-extrabold shadow-chunk">
              Start on Telegram →
            </a>
            <Link href="/app" className="press rounded-2xl border-[3px] border-ink bg-forest px-8 py-4 text-lg font-extrabold text-cream shadow-chunk">
              Open web app
            </Link>
          </div>
        </div>
      </section>

      <footer className="bg-forest-deep py-10 text-cream/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm font-semibold sm:flex-row sm:px-6">
          <p>🫙 Jarra · GoodBuilders Season 5</p>
          <p>Built on GoodDollar &amp; Celo · Brain on AntSeed · by Calbridge Digital Labs</p>
        </div>
      </footer>
    </main>
  )
}

function Bubble({ children, me }: { children: React.ReactNode; me?: boolean }) {
  return (
    <div className={`flex ${me ? 'justify-end' : ''}`}>
      <p
        className={`max-w-[85%] rounded-2xl border-[3px] border-ink px-4 py-3 text-base leading-snug font-semibold ${
          me ? 'rounded-br-md bg-forest text-cream' : 'rounded-bl-md bg-crest-soft'
        }`}
      >
        {children}
      </p>
    </div>
  )
}
