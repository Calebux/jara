import Link from 'next/link'
import { Jar } from '@/components/Jar'
import { botLink } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

const WEEK = [
  { day: 'Mon', icon: '☀️', title: 'Claimed G$ for you', body: 'Light jar 40% · Data 80% · Airtime 65%', tone: 'cream' },
  { day: 'Tue', icon: '💬', title: '"Buy 1GB for my mama"', body: 'Sent in 10 seconds. Paid from the Data jar.', tone: 'mandarin' },
  { day: 'Wed', icon: '🫙', title: 'Jars filling quietly', body: 'Free G$ split to whichever bill needs it most.', tone: 'cream' },
  { day: 'Thu', icon: '💡', title: 'Light jar hit ₦3,000', body: 'Auto-paid. Meter token sent to your chat.', tone: 'crest' },
  { day: 'Fri', icon: '📞', title: 'Airtime topped up', body: '"Abeg add ₦200 airtime" — done.', tone: 'cream' },
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
      <section className="relative bg-forest pb-20 text-cream">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-8 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-14">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border-[3px] border-ink bg-crest px-4 py-1.5 text-sm font-bold text-ink shadow-chunk-sm">
              <span className="h-2 w-2 rounded-full bg-mandarin" /> Powered by your daily GoodDollar
            </p>
            <h1 className="text-[3.2rem] leading-[0.92] font-extrabold tracking-[-0.03em] sm:text-7xl lg:text-[5.6rem]">
              Your free G$
              <br />
              pays your{' '}
              <span className="mt-2 inline-block -rotate-2 rounded-2xl border-[3px] border-ink bg-mandarin px-3 pt-1 pb-3 leading-[1] text-ink shadow-chunk">
                bills.
              </span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-cream/85 sm:text-xl">
              Jarra is a helper in your chat. Every day it collects your free GoodDollar, saves it in jars — <b className="text-crest">Light, Data, Airtime</b> — and pays them for you. Just talk to it like a friend.
            </p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <a
                href={tg ?? '/app'}
                className="press inline-flex items-center justify-center gap-2 rounded-2xl border-[3px] border-ink bg-mandarin px-7 py-4 text-lg font-extrabold text-ink shadow-chunk"
              >
                Start on Telegram →
              </a>
              <Link
                href="/app"
                className="press inline-flex items-center justify-center rounded-2xl border-[3px] border-ink bg-cream px-7 py-4 text-lg font-extrabold text-ink shadow-chunk"
              >
                Try it in the browser
              </Link>
            </div>
            <p className="mt-5 text-sm font-semibold text-cream/60">No crypto talk. No gas. No new app to learn.</p>
          </div>

          {/* jars + chat bubble */}
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute -inset-6 -z-0 rounded-[2.5rem] bg-forest-soft" />
            <div className="relative grid grid-cols-3 items-end gap-2 px-2 pt-10 pb-4">
              <div className="animate-bob" style={{ animationDelay: '0s' }}>
                <Jar pct={72} color="crest" lid="#ff6b00" className="h-48 sm:h-56">
                  <span className="text-3xl">💡</span>
                </Jar>
                <p className="mt-2 text-center font-extrabold">Light</p>
              </div>
              <div className="animate-bob" style={{ animationDelay: '0.4s' }}>
                <Jar pct={45} color="mandarin" className="h-56 sm:h-64">
                  <span className="text-3xl">📶</span>
                </Jar>
                <p className="mt-2 text-center font-extrabold">Data</p>
              </div>
              <div className="animate-bob" style={{ animationDelay: '0.8s' }}>
                <Jar pct={90} color="crest" lid="#ff6b00" className="h-44 sm:h-52">
                  <span className="text-3xl">📞</span>
                </Jar>
                <p className="mt-2 text-center font-extrabold">Airtime</p>
              </div>
            </div>
            <div className="relative -mt-2 ml-auto w-[85%] rotate-2 rounded-3xl rounded-br-md border-[3px] border-ink bg-cream p-4 text-ink shadow-chunk-lg">
              <p className="text-sm font-bold text-forest">Jarra</p>
              <p className="text-base font-semibold leading-snug">Light jar don full 🎉 I&apos;ve paid ₦3,000 for your meter. Token: 4021 7781 0093 2215 6650</p>
            </div>
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <div className="-mt-6 -rotate-1 border-y-[3px] border-ink bg-crest py-3">
        <div className="flex w-max animate-marquee gap-10 text-xl font-extrabold whitespace-nowrap text-ink">
          {Array.from({ length: 2 }).map((_, k) => (
            <div key={k} className="flex gap-10">
              {['💡 Light paid', '📶 Data sent', '📞 Airtime topped up', '☀️ G$ claimed daily', '🔥 Streak bonus', '🗣️ Speaks Pidgin', '🫙 Jars that fill themselves'].map((t) => (
                <span key={t}>{t} ✦</span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* HOW */}
      <section className="grain bg-cream py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="max-w-2xl text-4xl leading-none font-extrabold tracking-tight sm:text-6xl">
            Three things. <span className="text-mandarin">Every day.</span> Without you lifting a finger.
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { n: '01', t: 'It claims', d: 'Your free GoodDollar lands every day. Jarra collects it for you — even when you forget.', c: 'bg-crest' },
              { n: '02', t: 'It saves', d: 'G$ is split into jars for the bills you actually have. The jar that needs it most fills first.', c: 'bg-mandarin' },
              { n: '03', t: 'It pays', d: 'When a jar is full — or when you ask — Jarra pays the bill and sends you proof.', c: 'bg-forest text-cream' },
            ].map((s) => (
              <div key={s.n} className={`press rounded-3xl border-[3px] border-ink p-7 shadow-chunk-lg ${s.c}`}>
                <p className="text-6xl font-extrabold opacity-90">{s.n}</p>
                <p className="mt-6 text-3xl font-extrabold">{s.t}</p>
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
              English or Pidgin. Jarra always shows you what it&apos;s about to pay, and waits for your “yes”.
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
