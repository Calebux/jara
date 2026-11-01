'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createWalletClient, custom, type EIP1193Provider } from 'viem'
import { celo } from 'viem/chains'
import { DISCOS, DISCO_INFO, formatNgn } from '@/lib/catalog'
import { Jar, type JarColor } from './Jar'

// ---------- types mirrored from /api/_shared userState ----------

interface JarView {
  kind: 'light' | 'data' | 'airtime'
  label: string
  emoji: string
  balanceGd: number
  balanceNgn: number
  targetNgn: number
  pct: number
  autoPay: boolean
  details: { phone?: string; network?: string; disco?: string; meterType?: string; meterNumber?: string; customerName?: string }
}
interface Activity {
  id: number
  type: string
  title: string
  detail: string | null
  status: string
  amountWei: string | null
  txHash: string | null
  createdAt: number
}
interface Msg {
  id: number
  role: string
  content: string
}
interface State {
  user: {
    id: string
    name: string | null
    rootAddress: string | null
    agentAddress: string
    connected: boolean
    streak: number
    telegramLinked: boolean
    telegramLink: string | null
    hasPending: boolean
  }
  snapshot: { jars: JarView[]; totalGd: number; freeGd: number; freeNgn: number; ngnPerGd: number }
  activity: Activity[]
  messages: Msg[]
  config: { chainMode: 'celo' | 'mock'; provider: string; llm: string }
}

const JAR_COLOR: Record<JarView['kind'], JarColor> = { light: 'crest', data: 'mandarin', airtime: 'forest' }
const IDENTITY = '0xC361A6E67822a0EDc17D899227dd9FC50BD62F42'
const CONNECT_ABI = [
  { type: 'function', name: 'connectAccount', stateMutability: 'nonpayable', inputs: [{ name: 'account', type: 'address' }], outputs: [] },
] as const

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Something went wrong')
  return json as T
}

function injected(): EIP1193Provider | null {
  return typeof window !== 'undefined' ? ((window as unknown as { ethereum?: EIP1193Provider }).ethereum ?? null) : null
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const gdFmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })

// ---------- root ----------

export function AppClient({ tgCode }: { tgCode?: string }) {
  const [state, setState] = useState<State | null | undefined>(undefined)
  const [toast, setToast] = useState<string | null>(null)

  const flash = useCallback((t: string) => {
    setToast(t)
    window.setTimeout(() => setToast(null), 3500)
  }, [])

  useEffect(() => {
    ;(async () => {
      if (tgCode) {
        setState(await api<State>('/api/session', { tg: tgCode }))
        window.history.replaceState(null, '', '/app')
        return
      }
      const s = await api<State | { user: null }>('/api/session')
      setState(s.user ? (s as State) : null)
    })().catch(() => setState(null))
  }, [tgCode])

  return (
    <div className="min-h-dvh bg-cream">
      <TopBar state={state ?? null} />
      {state === undefined && <Loading />}
      {state === null && <Welcome onStart={setState} />}
      {state && !state.user.connected && <Onboarding state={state} setState={setState} flash={flash} />}
      {state && state.user.connected && <Dashboard state={state} setState={setState} flash={flash} />}
      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <p className="animate-pop rounded-2xl border-[3px] border-ink bg-ink px-5 py-3 font-bold text-cream shadow-chunk">{toast}</p>
        </div>
      )}
    </div>
  )
}

function TopBar({ state }: { state: State | null }) {
  return (
    <header className="border-b-[3px] border-ink bg-forest">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-cream">
          <span className="grid h-9 w-9 place-items-center rounded-xl border-[3px] border-ink bg-crest text-lg shadow-chunk-sm">🫙</span>
          <span className="text-xl font-extrabold">Jarra</span>
        </Link>
        <div className="flex items-center gap-2">
          {state?.config.chainMode === 'mock' && (
            <span className="rounded-full border-2 border-ink bg-crest px-3 py-0.5 text-xs font-extrabold text-ink">DEMO MODE</span>
          )}
          {state?.user.connected && (
            <span className="rounded-full border-2 border-ink bg-mandarin px-3 py-0.5 text-sm font-extrabold text-ink">🔥 {state.user.streak}</span>
          )}
        </div>
      </div>
    </header>
  )
}

function Loading() {
  return (
    <div className="grid min-h-[70dvh] place-items-center">
      <Jar pct={55} className="h-32 animate-bob" />
    </div>
  )
}

// ---------- welcome ----------

function Welcome({ onStart }: { onStart: (s: State) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <main className="mx-auto grid max-w-md gap-8 px-4 py-12">
      <div className="flex justify-center">
        <Jar pct={62} color="mandarin" className="h-44 animate-bob">
          <span className="text-3xl">👋</span>
        </Jar>
      </div>
      <div className="text-center">
        <h1 className="text-5xl leading-none font-extrabold tracking-tight">Hi, I&apos;m Jarra.</h1>
        <p className="mt-4 text-lg font-medium text-ink/75">I&apos;ll collect your free GoodDollar every day and use it to pay your light, data and airtime.</p>
      </div>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            onStart(await api<State>('/api/session', { name }))
          } finally {
            setBusy(false)
          }
        }}
      >
        <label className="grid gap-2">
          <span className="font-extrabold">What should I call you?</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Amaka"
            className="rounded-2xl border-[3px] border-ink bg-white px-4 py-3.5 text-lg font-semibold shadow-chunk-sm outline-none focus:bg-crest-soft"
          />
        </label>
        <button disabled={busy} className="press rounded-2xl border-[3px] border-ink bg-mandarin px-6 py-4 text-lg font-extrabold shadow-chunk disabled:opacity-60">
          {busy ? 'Setting up…' : "Let's go →"}
        </button>
      </form>
    </main>
  )
}

// ---------- onboarding ----------

function Onboarding({ state, setState, flash }: { state: State; setState: (s: State) => void; flash: (t: string) => void }) {
  const mock = state.config.chainMode === 'mock'
  const [address, setAddress] = useState(state.user.rootAddress ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const step = state.user.rootAddress ? 2 : 1

  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    try {
      await fn()
    } catch (err) {
      flash(err instanceof Error ? err.message.split('\n')[0].slice(0, 140) : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  const useWallet = () =>
    act('wallet', async () => {
      const eth = injected()
      if (!eth) throw new Error('No wallet found in this browser. Paste your address instead.')
      const [addr] = (await eth.request({ method: 'eth_requestAccounts' })) as string[]
      setAddress(addr)
      setState(await api<State>('/api/onboard', { action: 'root', address: addr }))
    })

  const approve = () =>
    act('approve', async () => {
      if (mock) {
        setState(await api<State>('/api/onboard', { action: 'check' }))
        return
      }
      const eth = injected()
      if (!eth) throw new Error("Open this page in your wallet's browser, or use GoodDollar's connect tool below.")
      const wallet = createWalletClient({ chain: celo, transport: custom(eth) })
      const [account] = await wallet.requestAddresses()
      if (account.toLowerCase() !== state.user.rootAddress?.toLowerCase()) {
        throw new Error(`Switch your wallet to ${short(state.user.rootAddress ?? '')} — your verified GoodDollar account.`)
      }
      await wallet.switchChain({ id: celo.id }).catch(() => wallet.addChain({ chain: celo }))
      const hash = await wallet.writeContract({
        account,
        address: IDENTITY,
        abi: CONNECT_ABI,
        functionName: 'connectAccount',
        args: [state.user.agentAddress as `0x${string}`],
      })
      flash('Approved! Waiting for Celo…')
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 2500))
        try {
          setState(await api<State>('/api/onboard', { action: 'check' }))
          return
        } catch {
          /* not mined yet */
        }
      }
      throw new Error(`Still waiting for ${hash.slice(0, 10)}… Tap "Check again" in a moment.`)
    })

  return (
    <main className="mx-auto grid max-w-xl gap-6 px-4 py-10">
      <div>
        <p className="text-sm font-extrabold tracking-widest text-mandarin uppercase">Setup · 1 minute</p>
        <h1 className="mt-2 text-4xl leading-none font-extrabold tracking-tight sm:text-5xl">
          {state.user.name ? `${state.user.name}, let's` : "Let's"} connect your GoodDollar.
        </h1>
      </div>

      <Step n={1} title="Your GoodDollar account" done={step > 1} active={step === 1}>
        {step === 1 ? (
          <div className="grid gap-3">
            <p className="font-medium text-ink/75">The wallet you verified your face with in GoodWallet / GoodDapp.</p>
            <button onClick={useWallet} disabled={!!busy} className="press rounded-2xl border-[3px] border-ink bg-crest px-5 py-3 font-extrabold shadow-chunk-sm">
              {busy === 'wallet' ? 'Connecting…' : 'Use my wallet'}
            </button>
            <div className="flex items-center gap-3 text-sm font-bold text-ink/50">
              <span className="h-[3px] flex-1 bg-ink/15" />
              or paste it
              <span className="h-[3px] flex-1 bg-ink/15" />
            </div>
            <div className="flex gap-2">
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value.trim())}
                placeholder="0x…"
                className="min-w-0 flex-1 rounded-2xl border-[3px] border-ink bg-white px-4 py-3 font-mono text-sm shadow-chunk-sm outline-none"
              />
              <button
                onClick={() => act('root', async () => setState(await api<State>('/api/onboard', { action: 'root', address })))}
                disabled={!!busy || !address}
                className="press rounded-2xl border-[3px] border-ink bg-mandarin px-5 font-extrabold shadow-chunk-sm disabled:opacity-50"
              >
                {busy === 'root' ? '…' : 'Next'}
              </button>
            </div>
            {mock && (
              <button
                onClick={() => act('root', async () => setState(await api<State>('/api/onboard', { action: 'root', address: '0x1111111111111111111111111111111111111111' })))}
                className="text-left text-sm font-bold text-forest underline"
              >
                Demo: use a test address
              </button>
            )}
            <a href="https://wallet.gooddollar.org" target="_blank" rel="noreferrer" className="text-sm font-bold text-forest underline">
              Not verified yet? Get your free G$ in GoodWallet first →
            </a>
          </div>
        ) : (
          <p className="font-mono text-sm font-bold">{short(state.user.rootAddress ?? '')} ✓</p>
        )}
      </Step>

      <Step n={2} title="Let Jarra claim for you" done={false} active={step === 2}>
        {step === 2 && (
          <div className="grid gap-3">
            <p className="font-medium text-ink/75">
              Approve one small transaction that links your Jarra jar to your GoodDollar account. Jarra can then collect your daily G$ — it can&apos;t touch your main wallet.
            </p>
            <div className="rounded-2xl border-[3px] border-dashed border-ink/40 bg-white px-4 py-3">
              <p className="text-xs font-extrabold tracking-wider text-ink/50 uppercase">Your jar address</p>
              <p className="font-mono text-sm font-bold break-all">{state.user.agentAddress}</p>
            </div>
            <button onClick={approve} disabled={!!busy} className="press rounded-2xl border-[3px] border-ink bg-mandarin px-5 py-4 text-lg font-extrabold shadow-chunk disabled:opacity-60">
              {busy === 'approve' ? 'Waiting for approval…' : mock ? 'Approve (demo)' : 'Approve in my wallet'}
            </button>
            {!mock && (
              <>
                <button
                  onClick={() => act('check', async () => setState(await api<State>('/api/onboard', { action: 'check' })))}
                  disabled={!!busy}
                  className="press rounded-2xl border-[3px] border-ink bg-cream px-5 py-3 font-extrabold shadow-chunk-sm"
                >
                  {busy === 'check' ? 'Checking…' : 'I approved — check again'}
                </button>
                <a href="https://h3n3kp.csb.app/" target="_blank" rel="noreferrer" className="text-sm font-bold text-forest underline">
                  Wallet not working here? Use GoodDollar&apos;s connect tool and paste your jar address →
                </a>
              </>
            )}
          </div>
        )}
      </Step>
    </main>
  )
}

function Step({ n, title, done, active, children }: { n: number; title: string; done: boolean; active: boolean; children: React.ReactNode }) {
  return (
    <section
      className={`rounded-3xl border-[3px] border-ink p-5 transition ${active ? 'bg-white shadow-chunk-lg' : 'bg-cream opacity-70'} ${done ? 'bg-crest-soft opacity-100' : ''}`}
    >
      <div className="mb-3 flex items-center gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-full border-[3px] border-ink font-extrabold ${done ? 'bg-forest text-cream' : 'bg-crest'}`}>
          {done ? '✓' : n}
        </span>
        <h2 className="text-xl font-extrabold">{title}</h2>
      </div>
      {children}
    </section>
  )
}

// ---------- dashboard ----------

function Dashboard({ state, setState, flash }: { state: State; setState: (s: State) => void; flash: (t: string) => void }) {
  const [tab, setTab] = useState<'jars' | 'chat' | 'activity'>('jars')
  const [editing, setEditing] = useState<JarView | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const { snapshot: snap, user } = state
  const mock = state.config.chainMode === 'mock'
  const totalNgn = Math.floor(snap.totalGd * snap.ngnPerGd)

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    try {
      await fn()
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  const claim = () =>
    run('claim', async () => {
      const r = await api<{ message: string; state: State }>('/api/claim', {})
      setState(r.state)
      flash(r.message.split('\n')[0])
    })

  return (
    <main className="mx-auto max-w-6xl px-4 pt-6 pb-28 sm:px-6 lg:pb-10">
      {/* summary */}
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="relative overflow-hidden rounded-3xl border-[3px] border-ink bg-forest p-6 text-cream shadow-chunk-lg">
          <p className="font-bold text-cream/70">{user.name ? `${user.name}'s jars` : 'Your jars'}</p>
          <p className="mt-1 text-5xl font-extrabold tracking-tight sm:text-6xl">{formatNgn(totalNgn)}</p>
          <p className="mt-1 font-semibold text-crest">G$ {gdFmt(snap.totalGd)} saved for bills</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={claim} disabled={!!busy} className="press rounded-2xl border-[3px] border-ink bg-mandarin px-5 py-3 font-extrabold text-ink shadow-chunk-sm disabled:opacity-60">
              {busy === 'claim' ? 'Claiming…' : '☀️ Claim today'}
            </button>
            <button onClick={() => setTab('chat')} className="press rounded-2xl border-[3px] border-ink bg-cream px-5 py-3 font-extrabold text-ink shadow-chunk-sm lg:hidden">
              💬 Ask Jarra
            </button>
          </div>
          <div className="pointer-events-none absolute -right-6 -bottom-10 hidden h-48 w-40 rotate-12 opacity-90 sm:block">
            <Jar pct={snap.jars.reduce((s, j) => s + j.pct, 0) / 3} color="crest" lid="#ff6b00" className="h-full" />
          </div>
        </div>
        <TelegramCard state={state} />
      </section>

      {mock && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border-[3px] border-dashed border-ink bg-crest-soft px-4 py-3 text-sm font-bold">
          <span className="mr-1">🧪 Demo tools:</span>
          <button
            onClick={() => run('dep', async () => setState(await api<State>('/api/demo/deposit', { gd: 5000 })))}
            className="press rounded-xl border-2 border-ink bg-white px-3 py-1 shadow-chunk-sm"
          >
            + G$ 5,000
          </button>
          <button
            onClick={() =>
              run('day', async () => {
                await api<State>('/api/demo/deposit', { action: 'next-day' })
                const r = await api<{ message: string; state: State }>('/api/claim', {})
                setState(r.state)
                flash(r.message.split('\n')[0])
              })
            }
            className="press rounded-xl border-2 border-ink bg-white px-3 py-1 shadow-chunk-sm"
          >
            ⏭ Next day
          </button>
          <span className="text-ink/60">1 G$ = ₦{snap.ngnPerGd.toFixed(3)}</span>
        </div>
      )}

      {/* mobile tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 gap-2 border-t-[3px] border-ink bg-cream p-3 lg:hidden">
        {(['jars', 'chat', 'activity'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-xl border-[3px] border-ink py-2.5 font-extrabold capitalize ${tab === t ? 'bg-mandarin shadow-chunk-sm' : 'bg-white'}`}
          >
            {t === 'jars' ? '🫙 Jars' : t === 'chat' ? '💬 Chat' : '📜 Activity'}
          </button>
        ))}
      </nav>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className={`grid content-start gap-6 ${tab === 'chat' ? 'hidden lg:grid' : ''}`}>
          <section className={tab === 'activity' ? 'hidden lg:block' : ''}>
            <h2 className="mb-3 text-2xl font-extrabold">Bill jars</h2>
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {snap.jars.map((j) => (
                <JarCard key={j.kind} jar={j} onEdit={() => setEditing(j)} />
              ))}
            </div>
            {snap.freeGd > 0.5 && (
              <p className="mt-3 text-sm font-bold text-ink/60">
                + G$ {gdFmt(snap.freeGd)} ({formatNgn(snap.freeNgn)}) free — all jars are at target.
              </p>
            )}
          </section>
          <section className={tab === 'jars' ? 'hidden lg:block' : ''}>
            <h2 className="mb-3 text-2xl font-extrabold">What Jarra did</h2>
            <ActivityList items={state.activity} chainMode={state.config.chainMode} />
          </section>
        </div>
        <div className={tab === 'chat' ? '' : 'hidden lg:block'}>
          <Chat state={state} setState={setState} flash={flash} />
        </div>
      </div>

      {editing && (
        <JarSheet
          jar={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            try {
              setState(await api<State>('/api/jars', { kind: editing.kind, ...patch }))
              setEditing(null)
              flash(`${editing.label} jar saved`)
            } catch (err) {
              flash(err instanceof Error ? err.message : 'Could not save')
            }
          }}
        />
      )}
    </main>
  )
}

function JarCard({ jar, onEdit }: { jar: JarView; onEdit: () => void }) {
  const bg = jar.kind === 'light' ? 'bg-white' : jar.kind === 'data' ? 'bg-crest-soft' : 'bg-white'
  const setUp = jar.kind === 'light' ? Boolean(jar.details.meterNumber) : Boolean(jar.details.phone)
  return (
    <button onClick={onEdit} className={`press group min-w-0 rounded-3xl border-[3px] border-ink p-3 text-left shadow-chunk sm:p-4 ${bg}`}>
      <div className="flex flex-wrap items-center justify-between gap-1">
        <p className="text-base font-extrabold sm:text-lg">
          {jar.emoji} {jar.label}
        </p>
        {jar.autoPay && <span className="rounded-full border-2 border-ink bg-forest px-1.5 py-0.5 text-[10px] font-extrabold text-cream">AUTO</span>}
      </div>
      <div className="my-2 flex justify-center">
        <Jar pct={jar.pct} color={JAR_COLOR[jar.kind]} lid={jar.kind === 'airtime' ? '#ff6b00' : '#ffc72c'} className="h-28 sm:h-32">
          <span className="rounded-lg border-2 border-ink bg-cream px-2 text-lg font-extrabold">{jar.pct}%</span>
        </Jar>
      </div>
      <p className="text-base leading-tight font-extrabold sm:text-lg">{formatNgn(jar.balanceNgn)}</p>
      <p className="text-xs font-bold text-ink/50">of {formatNgn(jar.targetNgn)}</p>
      <p className="mt-1 truncate text-xs font-bold text-ink/60">{setUp ? (jar.kind === 'light' ? `Meter ${jar.details.meterNumber}` : jar.details.phone) : 'Tap to set up →'}</p>
    </button>
  )
}

function JarSheet({ jar, onClose, onSave }: { jar: JarView; onClose: () => void; onSave: (p: Record<string, unknown>) => Promise<void> }) {
  const [target, setTarget] = useState(jar.targetNgn)
  const [autoPay, setAutoPay] = useState(jar.autoPay)
  const [phone, setPhone] = useState(jar.details.phone ?? '')
  const [disco, setDisco] = useState(jar.details.disco ?? 'kaduna')
  const [meterType, setMeterType] = useState(jar.details.meterType ?? 'prepaid')
  const [meter, setMeter] = useState(jar.details.meterNumber ?? '')
  const [saving, setSaving] = useState(false)
  const presets = jar.kind === 'light' ? [2000, 3000, 5000, 10000] : jar.kind === 'data' ? [500, 1000, 1500, 3000] : [200, 500, 1000, 2000]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="animate-pop max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-[3px] border-ink bg-cream p-6 shadow-chunk-lg sm:rounded-3xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-3xl font-extrabold">
            {jar.emoji} {jar.label} jar
          </h3>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border-[3px] border-ink bg-white font-extrabold">
            ✕
          </button>
        </div>

        <p className="mb-2 font-extrabold">Save up to</p>
        <div className="grid grid-cols-4 gap-2">
          {presets.map((p) => (
            <button key={p} onClick={() => setTarget(p)} className={`rounded-xl border-[3px] border-ink py-2 font-extrabold ${target === p ? 'bg-mandarin shadow-chunk-sm' : 'bg-white'}`}>
              {p >= 1000 ? `₦${p / 1000}k` : `₦${p}`}
            </button>
          ))}
        </div>

        {jar.kind === 'light' ? (
          <div className="mt-5 grid gap-3">
            <label className="grid gap-1">
              <span className="font-extrabold">Electricity company</span>
              <select value={disco} onChange={(e) => setDisco(e.target.value)} className="rounded-xl border-[3px] border-ink bg-white px-3 py-3 font-semibold">
                {DISCOS.map((d) => (
                  <option key={d} value={d}>
                    {DISCO_INFO[d].short} — {DISCO_INFO[d].region}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {['prepaid', 'postpaid'].map((t) => (
                <button key={t} onClick={() => setMeterType(t)} className={`rounded-xl border-[3px] border-ink py-2 font-extrabold capitalize ${meterType === t ? 'bg-crest shadow-chunk-sm' : 'bg-white'}`}>
                  {t}
                </button>
              ))}
            </div>
            <label className="grid gap-1">
              <span className="font-extrabold">Meter number</span>
              <input value={meter} onChange={(e) => setMeter(e.target.value)} inputMode="numeric" placeholder="e.g. 4502 1234 567" className="rounded-xl border-[3px] border-ink bg-white px-3 py-3 font-semibold" />
            </label>
            {jar.details.customerName && <p className="text-sm font-bold text-forest">✓ {jar.details.customerName}</p>}
          </div>
        ) : (
          <label className="mt-5 grid gap-1">
            <span className="font-extrabold">Phone number</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="0803 123 4567" className="rounded-xl border-[3px] border-ink bg-white px-3 py-3 font-semibold" />
          </label>
        )}

        <button onClick={() => setAutoPay(!autoPay)} className="mt-5 flex w-full items-center justify-between rounded-2xl border-[3px] border-ink bg-white px-4 py-3 text-left">
          <span>
            <span className="block font-extrabold">Pay automatically</span>
            <span className="text-sm font-semibold text-ink/60">When the jar reaches {formatNgn(target)}</span>
          </span>
          <span className={`relative h-8 w-14 rounded-full border-[3px] border-ink transition ${autoPay ? 'bg-forest' : 'bg-cream'}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full border-2 border-ink bg-crest transition-all ${autoPay ? 'left-7' : 'left-0.5'}`} />
          </span>
        </button>

        <button
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            await onSave(
              jar.kind === 'light'
                ? { targetNgn: target, autoPay, disco, meterType, meterNumber: meter || undefined }
                : { targetNgn: target, autoPay, phone: phone || undefined },
            )
            setSaving(false)
          }}
          className="press mt-6 w-full rounded-2xl border-[3px] border-ink bg-mandarin py-4 text-lg font-extrabold shadow-chunk disabled:opacity-60"
        >
          {saving ? (jar.kind === 'light' && meter ? 'Checking meter…' : 'Saving…') : 'Save jar'}
        </button>
      </div>
    </div>
  )
}

function ActivityList({ items, chainMode }: { items: Activity[]; chainMode: string }) {
  if (!items.length) return <p className="rounded-3xl border-[3px] border-dashed border-ink/40 p-6 text-center font-bold text-ink/50">Nothing yet — tap “Claim today”.</p>
  const icon: Record<string, string> = { claim: '☀️', pay: '✅', refund: '↩️', reward: '🔥', deposit: '➕', move: '🫙' }
  return (
    <ul className="divide-y-[3px] divide-ink overflow-hidden rounded-3xl border-[3px] border-ink bg-white shadow-chunk">
      {items.map((a) => (
        <li key={a.id} className="flex items-start gap-3 px-4 py-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 border-ink bg-crest-soft text-lg">{a.status === 'failed' ? '⚠️' : (icon[a.type] ?? '•')}</span>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold leading-tight">{a.title}</p>
            {a.detail && <p className="mt-0.5 text-sm font-semibold break-words text-ink/60">{a.detail}</p>}
            <p className="mt-0.5 text-xs font-bold text-ink/40">
              {new Date(a.createdAt).toLocaleString('en-NG', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
              {a.status === 'pending' && ' · processing'}
              {a.txHash && chainMode === 'celo' && (
                <>
                  {' · '}
                  <a href={`https://celoscan.io/tx/${a.txHash}`} target="_blank" rel="noreferrer" className="underline">
                    receipt
                  </a>
                </>
              )}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

function TelegramCard({ state }: { state: State }) {
  const { telegramLinked, telegramLink } = state.user
  return (
    <div className="flex flex-col justify-between rounded-3xl border-[3px] border-ink bg-crest p-6 shadow-chunk-lg">
      <div>
        <p className="text-2xl font-extrabold leading-tight">{telegramLinked ? 'Jarra is in your Telegram ✓' : 'Get Jarra in your chat'}</p>
        <p className="mt-2 font-semibold text-ink/75">
          {telegramLinked ? 'You’ll get a morning message after every claim. Reply any time to pay a bill.' : 'Morning updates + pay bills by just texting. Like a friend who handles it.'}
        </p>
      </div>
      {!telegramLinked &&
        (telegramLink ? (
          <a href={telegramLink} target="_blank" rel="noreferrer" className="press mt-5 rounded-2xl border-[3px] border-ink bg-forest px-5 py-3 text-center font-extrabold text-cream shadow-chunk-sm">
            Open in Telegram →
          </a>
        ) : (
          <p className="mt-5 rounded-2xl border-[3px] border-dashed border-ink px-4 py-3 text-sm font-bold">Telegram bot not configured yet — use the chat here.</p>
        ))}
    </div>
  )
}

// ---------- chat ----------

const CHIPS = ['How much is in my jars?', '₦200 airtime for me', '1GB data for me', 'Buy ₦3000 light']

function Chat({ state, setState, flash }: { state: State; setState: (s: State) => void; flash: (t: string) => void }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [confirm, setConfirm] = useState<{ summary: string; gd: number } | null>(state.user.hasPending ? { summary: 'your last request', gd: 0 } : null)
  const [optimistic, setOptimistic] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [state.messages.length, optimistic, sending])

  const send = async (body: { text?: string; confirm?: boolean }) => {
    setSending(true)
    if (body.text) setOptimistic(body.text)
    try {
      const r = await api<{ reply: { text: string; confirm?: { summary: string; gd: number } }; state: State }>('/api/chat', body)
      setState(r.state)
      setConfirm(r.reply.confirm ?? null)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not send')
    } finally {
      setOptimistic(null)
      setSending(false)
    }
  }

  return (
    <section className="flex h-[calc(100dvh-13rem)] flex-col overflow-hidden rounded-3xl border-[3px] border-ink bg-white shadow-chunk-lg lg:sticky lg:top-6 lg:h-[640px]">
      <div className="flex items-center gap-3 border-b-[3px] border-ink bg-forest px-4 py-3 text-cream">
        <span className="grid h-10 w-10 place-items-center rounded-full border-[3px] border-ink bg-crest text-lg">🫙</span>
        <div>
          <p className="font-extrabold leading-none">Jarra</p>
          <p className="mt-1 text-xs font-bold text-cream/60">{state.config.llm === 'antseed' ? 'thinking on AntSeed' : state.config.llm === 'rules' ? 'quick mode' : 'online'}</p>
        </div>
      </div>
      <div className="grain flex-1 space-y-3 overflow-y-auto p-4">
        {state.messages.length === 0 && !optimistic && (
          <p className="mx-auto max-w-[85%] rounded-2xl rounded-bl-md border-[3px] border-ink bg-crest-soft px-4 py-3 font-semibold">
            Hi{state.user.name ? ` ${state.user.name}` : ''}! Tell me what to pay — airtime, data or light. I&apos;ll show you before I pay anything.
          </p>
        )}
        {state.messages.map((m) => (
          <ChatBubble key={m.id} me={m.role === 'user'} text={m.content} />
        ))}
        {optimistic && <ChatBubble me text={optimistic} />}
        {sending && (
          <div className="flex gap-1 pl-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-2.5 w-2.5 animate-bounce rounded-full bg-mandarin" style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          </div>
        )}
        {confirm && !sending && (
          <div className="flex gap-2 pl-1">
            <button onClick={() => send({ confirm: true })} className="press rounded-xl border-[3px] border-ink bg-mandarin px-4 py-2 font-extrabold shadow-chunk-sm">
              ✅ Pay it{confirm.gd ? ` · G$ ${gdFmt(confirm.gd)}` : ''}
            </button>
            <button onClick={() => send({ confirm: false })} className="press rounded-xl border-[3px] border-ink bg-cream px-4 py-2 font-extrabold shadow-chunk-sm">
              ✖ Cancel
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 overflow-x-auto border-t-[3px] border-ink bg-cream px-3 pt-3">
        {CHIPS.map((c) => (
          <button key={c} onClick={() => send({ text: c })} disabled={sending} className="shrink-0 rounded-full border-2 border-ink bg-white px-3 py-1 text-sm font-bold whitespace-nowrap">
            {c}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          const t = text
          setText('')
          send({ text: t })
        }}
        className="flex gap-2 bg-cream p-3"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Abeg send ₦500 airtime to 0803…"
          className="min-w-0 flex-1 rounded-2xl border-[3px] border-ink bg-white px-4 py-3 font-semibold outline-none focus:bg-crest-soft"
        />
        <button disabled={sending || !text.trim()} className="press rounded-2xl border-[3px] border-ink bg-mandarin px-5 font-extrabold shadow-chunk-sm disabled:opacity-50">
          Send
        </button>
      </form>
    </section>
  )
}

function ChatBubble({ me, text }: { me: boolean; text: string }) {
  return (
    <div className={`flex ${me ? 'justify-end' : ''}`}>
      <p
        className={`max-w-[85%] rounded-2xl border-[3px] border-ink px-4 py-2.5 leading-snug font-semibold whitespace-pre-line ${
          me ? 'rounded-br-md bg-forest text-cream' : 'rounded-bl-md bg-crest-soft'
        }`}
      >
        {text}
      </p>
    </div>
  )
}
