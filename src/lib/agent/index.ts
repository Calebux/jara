import { formatEther } from 'viem'
import { describeAction, payBill, prepareBill } from '../bills'
import { DISCO_INFO, formatNgn, isDisco, isNetwork, normalizePhone, detectNetwork } from '../catalog'
import { run } from '../db'
import { serverConfig } from '../env'
import { moveToJar, snapshot, syncJars, updateJar, type Snapshot } from '../jars'
import { gdForNgn } from '../price'
import { runDaily } from '../daily'
import { getUserById, isJarKind, listActivity, updateUser, type JarKind, type PendingAction, type User } from '../users'
import { chat, llmReachable, type ChatMessage, type ToolDef } from './llm'
import { fallbackIntent } from './fallback'
import { runAgent } from './routine'
import { CITIES, SKILLS, acceptGig, isSkill, matchGigs, submitGig, userGigs } from '../gigs'
import { rewardProgress } from '../rewards'

export interface AgentReply {
  text: string
  /** Set when a bill is waiting for the user to tap Confirm. */
  confirm?: { summary: string; gd: number }
  explorerUrl?: string
  engine: 'antseed' | 'llm' | 'rules'
}

const YES = /^(y|yes|yeah|yep|ok|okay|confirm|go|oya|do it|sure|pay|send)\b/i
const NO = /^(n|no|nope|cancel|stop|abeg no|leave it)\b/i
const PENDING_TTL = 10 * 60_000

const TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'get_jars',
      description: "Current jar balances (G$ and naira value), targets, saved phone/meter details and free balance.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_bill',
      description:
        'Prepare a bill payment. It is NOT paid yet: the user must confirm. Use for airtime, data or light (electricity). If phone/meter is omitted the saved jar details are used.',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['airtime', 'data', 'light'] },
          amount_ngn: { type: 'number', description: 'Naira amount. For data, the max to spend.' },
          phone: { type: 'string', description: 'Nigerian phone number, if given' },
          network: { type: 'string', enum: ['mtn', 'airtel', 'glo', '9mobile'] },
          plan: { type: 'string', description: 'Data size if mentioned, e.g. "1GB"' },
          for_whom: { type: 'string', description: 'Who it is for, e.g. "mama"' },
        },
        required: ['kind'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_to_jar',
      description: 'Move naira-worth of G$ into a jar from free balance or other jars.',
      parameters: {
        type: 'object',
        properties: { jar: { type: 'string', enum: ['light', 'data', 'airtime'] }, amount_ngn: { type: 'number' } },
        required: ['jar', 'amount_ngn'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_jar',
      description: 'Change a jar: savings target in naira, auto-pay on/off, or the phone number/network it pays.',
      parameters: {
        type: 'object',
        properties: {
          jar: { type: 'string', enum: ['light', 'data', 'airtime'] },
          target_ngn: { type: 'number' },
          auto_pay: { type: 'boolean' },
          phone: { type: 'string' },
          network: { type: 'string', enum: ['mtn', 'airtel', 'glo', '9mobile'] },
        },
        required: ['jar'],
      },
    },
  },
  {
    type: 'function',
    function: { name: 'claim_now', description: "Claim today's free G$ UBI into the jars now.", parameters: { type: 'object', properties: {} } },
  },
  {
    type: 'function',
    function: {
      name: 'find_work',
      description: 'Small jobs paid in G$ that Jarra found for the user (and searches for new ones). Returns id, title, pay, status.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'accept_gig',
      description: 'User wants to take a gig.',
      parameters: { type: 'object', properties: { gig_id: { type: 'string' } }, required: ['gig_id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish_gig',
      description: 'User says they finished an accepted gig; include what they did as proof.',
      parameters: { type: 'object', properties: { gig_id: { type: 'string' }, proof: { type: 'string' } }, required: ['gig_id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_profile',
      description: 'Save what the user can do and where they live, so Jarra can find them paid work.',
      parameters: {
        type: 'object',
        properties: {
          skills: { type: 'array', items: { type: 'string', enum: Object.keys(SKILLS) } },
          city: { type: 'string', enum: [...CITIES] },
        },
      },
    },
  },
  {
    type: 'function',
    function: { name: 'my_rewards', description: 'G$ rewards earned so far and what the user is close to earning.', parameters: { type: 'object', properties: {} } },
  },
  {
    type: 'function',
    function: {
      name: 'run_agent',
      description: 'Do a full check-in now: claim G$, fill jars, pay due bills, collect rewards, find work.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: { name: 'recent_activity', description: 'The last few things Jarra did (claims, payments, rewards).', parameters: { type: 'object', properties: {} } },
  },
]

function systemPrompt(user: User, snap: Snapshot): string {
  const jars = snap.jars
    .map((j) => `${j.label}: ${formatNgn(j.balanceNgn)} of ${formatNgn(j.targetNgn)} (${j.pct}%)${j.autoPay ? ', auto-pay on' : ''}`)
    .join('; ')
  return [
    'You are Jarra, an AI agent for everyday life in Nigeria. G$ (GoodDollar) drives everything you do.',
    'You quietly handle four jobs: SAVE (claim free daily G$ into jars: Light, Data, Airtime), PAY (bills from the jars),',
    'find REWARDS (G$ bonuses) and find WORK (small gigs paid in G$, matched to the user\'s skills and city).',
    'Talk like a warm Nigerian friend: short, simple English; understand Pidgin and reply in Pidgin if the user writes Pidgin.',
    'Never use crypto jargon (no "wallet", "token", "gas", "blockchain") unless the user asks. Say "your jar" and "G$".',
    'Always use propose_bill for payments — never claim something is paid until the system confirms it.',
    'After propose_bill succeeds, ask the user to confirm in one short line.',
    'Keep replies under 60 words. Use naira amounts.',
    `Skills: ${user.skills.join(', ') || 'unknown'}. City: ${user.city ?? 'unknown'}.`,
    `User: ${user.name ?? 'friend'}. Streak: ${user.streak} days. Jars: ${jars}. Free: ${formatNgn(snap.freeNgn)}. 1 G$ = ₦${snap.ngnPerGd.toFixed(4)}.`,
  ].join(' ')
}

async function saveMessage(userId: string, role: 'user' | 'assistant', content: string) {
  await run('INSERT INTO messages (user_id, role, content, created_at) VALUES (?, ?, ?, ?)', [userId, role, content, Date.now()])
}

async function history(userId: string): Promise<ChatMessage[]> {
  const r = await run('SELECT role, content FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 10', [userId])
  return r.rows.reverse().map((x) => ({ role: x.role as 'user' | 'assistant', content: x.content as string }))
}

export async function listMessages(userId: string) {
  const r = await run('SELECT id, role, content, created_at FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 40', [userId])
  return r.rows.reverse().map((x) => ({ id: Number(x.id), role: x.role as string, content: x.content as string, createdAt: Number(x.created_at) }))
}

// ---------- tool implementations ----------

async function propose(user: User, args: Record<string, unknown>): Promise<{ text: string; confirm?: AgentReply['confirm'] }> {
  if (!isJarKind(args.kind)) return { text: 'error: kind must be airtime, data or light' }
  const prepared = await prepareBill(user, {
    kind: args.kind,
    amountNgn: Number(args.amount_ngn ?? (args.kind === 'data' ? 20_000 : 0)),
    phone: typeof args.phone === 'string' ? args.phone : undefined,
    network: typeof args.network === 'string' ? args.network : undefined,
    planName: typeof args.plan === 'string' ? args.plan : undefined,
    forWhom: typeof args.for_whom === 'string' ? args.for_whom : undefined,
  })
  if ('error' in prepared) return { text: `error: ${prepared.error}` }
  await updateUser(user.id, { pending: prepared.action })
  const gd = Number(formatEther(await gdForNgn(prepared.action.amountNgn)))
  const summary = describeAction(prepared.action)
  return { text: `ready to confirm: ${summary} costing G$ ${gd.toFixed(0)}`, confirm: { summary, gd: Math.round(gd) } }
}

async function setJar(user: User, args: Record<string, unknown>): Promise<string> {
  if (!isJarKind(args.jar)) return 'error: unknown jar'
  const details: Record<string, string> = {}
  if (typeof args.phone === 'string') {
    const phone = normalizePhone(args.phone, true)
    if (!phone) return 'error: invalid phone'
    details.phone = phone
    details.network = (isNetwork(args.network) ? args.network : detectNetwork(phone)) ?? ''
  }
  await updateJar(user.id, args.jar, {
    targetNgn: typeof args.target_ngn === 'number' ? args.target_ngn : undefined,
    autoPay: typeof args.auto_pay === 'boolean' ? args.auto_pay : undefined,
    details,
  })
  return `updated ${args.jar} jar`
}

async function executeTool(user: User, name: string, args: Record<string, unknown>, out: { confirm?: AgentReply['confirm'] }) {
  switch (name) {
    case 'get_jars':
      return JSON.stringify(await snapshot(user))
    case 'propose_bill': {
      const r = await propose(user, args)
      if (r.confirm) out.confirm = r.confirm
      return r.text
    }
    case 'move_to_jar': {
      if (!isJarKind(args.jar)) return 'error: unknown jar'
      const r = await moveToJar(user, args.jar, Number(args.amount_ngn))
      return r.movedGd > 0 ? `moved G$ ${r.movedGd.toFixed(0)}` : 'error: no G$ available to move'
    }
    case 'set_jar':
      return setJar(user, args)
    case 'claim_now': {
      const fresh = (await getUserById(user.id))!
      if (!fresh.connected) return 'error: user has not connected their GoodDollar account yet; tell them to finish setup in the app'
      const r = await runDaily(fresh)
      return r.claimed > 0n ? r.message : 'already claimed today; next claim tomorrow'
    }
    case 'find_work': {
      const fresh = (await getUserById(user.id))!
      await matchGigs(fresh)
      const gigs = (await userGigs(user.id)).filter((g) => g.status !== 'paid')
      return gigs.length
        ? JSON.stringify(gigs.map((g) => ({ id: g.id, title: g.title, pays_gd: g.rewardGd, status: g.status, by: g.poster })))
        : 'no gigs matched yet — ask the user what they can do (skills) and their city, then call set_profile'
    }
    case 'accept_gig':
      return acceptGig(user, String(args.gig_id ?? ''))
    case 'finish_gig':
      return submitGig(user, String(args.gig_id ?? ''), String(args.proof ?? 'Done'))
    case 'set_profile': {
      const skills = Array.isArray(args.skills) ? args.skills.filter(isSkill) : user.skills
      const city = typeof args.city === 'string' && (CITIES as readonly string[]).includes(args.city) ? args.city : user.city
      await updateUser(user.id, { skills, city })
      return `saved skills: ${skills.join(', ') || 'none'}; city: ${city ?? 'not set'}`
    }
    case 'my_rewards':
      return JSON.stringify(await rewardProgress(user))
    case 'run_agent': {
      const fresh = (await getUserById(user.id))!
      if (!fresh.connected) return 'error: user has not connected their GoodDollar account yet'
      return (await runAgent(user.id)).message
    }
    case 'recent_activity':
      return JSON.stringify((await listActivity(user.id, 6)).map((a) => ({ title: a.title, status: a.status, when: new Date(a.createdAt).toISOString() })))
    default:
      return `error: unknown tool ${name}`
  }
}

// ---------- main entry ----------

export async function handleMessage(userId: string, text: string): Promise<AgentReply> {
  const user = (await getUserById(userId))!
  const clean = text.trim()
  await saveMessage(user.id, 'user', clean)
  const reply = await respond(user, clean)
  await saveMessage(user.id, 'assistant', reply.text)
  return reply
}

/** Confirm or cancel the waiting bill (buttons call this directly). */
export async function resolvePending(userId: string, accept: boolean): Promise<AgentReply> {
  const user = (await getUserById(userId))!
  const pending = user.pending
  await updateUser(user.id, { pending: null })
  if (!pending || Date.now() - pending.createdAt > PENDING_TTL) {
    return { text: 'That request expired. Tell me again what to pay.', engine: 'rules' }
  }
  if (!accept) return { text: 'No wahala, cancelled. Nothing was paid.', engine: 'rules' }
  const res = await payBill(user, pending)
  return { text: res.message, explorerUrl: res.explorerUrl, engine: 'rules' }
}

async function respond(user: User, text: string): Promise<AgentReply> {
  if (user.pending && YES.test(text)) return resolvePending(user.id, true)
  if (user.pending && NO.test(text)) return resolvePending(user.id, false)

  await syncJars(user).catch((err) => console.warn('[agent] sync failed', err))
  const snap = await snapshot(user)

  if (!(await llmReachable())) return rulesRespond(user, text, snap)
  try {
    return await llmRespond(user, text, snap)
  } catch (err) {
    if (!serverConfig().llm.disabled) console.warn('[agent] LLM unavailable, using rules:', err instanceof Error ? err.message : err)
    return rulesRespond(user, text, snap)
  }
}

async function llmRespond(user: User, text: string, snap: Snapshot): Promise<AgentReply> {
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt(user, snap) }, ...(await history(user.id))]
  if (messages[messages.length - 1]?.content !== text) messages.push({ role: 'user', content: text })
  const out: { confirm?: AgentReply['confirm'] } = {}
  for (let step = 0; step < 4; step++) {
    const msg = await chat(messages, TOOLS)
    if (!msg.tool_calls?.length) {
      const engine = serverConfig().llm.baseUrl.includes(':8377') ? 'antseed' : 'llm'
      return { text: (msg.content ?? '').trim() || 'Done.', confirm: out.confirm, engine }
    }
    messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls })
    for (const call of msg.tool_calls) {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(call.function.arguments || '{}')
      } catch {
        /* bad JSON from model: run with no args */
      }
      const result = await executeTool(user, call.function.name, args, out)
      messages.push({ role: 'tool', tool_call_id: call.id, content: result })
    }
  }
  return { text: 'Sorry, I got confused. Try saying it another way?', confirm: out.confirm, engine: 'llm' }
}

async function rulesRespond(user: User, text: string, snap: Snapshot): Promise<AgentReply> {
  const intent = fallbackIntent(text)
  const out: { confirm?: AgentReply['confirm'] } = {}
  switch (intent.type) {
    case 'bill': {
      const r = await propose(user, { kind: intent.kind, amount_ngn: intent.amountNgn, phone: intent.phone, plan: intent.plan })
      if (r.confirm) return { text: `I'll pay ${r.confirm.summary} with G$ ${r.confirm.gd} from your jar. Confirm?`, confirm: r.confirm, engine: 'rules' }
      return { text: r.text.replace(/^error: /, ''), engine: 'rules' }
    }
    case 'balance':
      return {
        text: [...snap.jars.map((j) => `${j.emoji} ${j.label}: ${formatNgn(j.balanceNgn)} / ${formatNgn(j.targetNgn)} (${j.pct}%)`), `Free: ${formatNgn(snap.freeNgn)}`].join('\n'),
        engine: 'rules',
      }
    case 'claim': {
      const t = await executeTool(user, 'claim_now', {}, out)
      return { text: t.replace(/^error: /, ''), engine: 'rules' }
    }
    case 'work': {
      const t = await executeTool(user, 'find_work', {}, out)
      if (t.startsWith('no gigs')) return { text: 'Tell me what you can do so I can find you paid work — e.g. "I can type and speak Hausa, I live in Kaduna". Or set it in the Work tab.', engine: 'rules' }
      const gigs = JSON.parse(t) as { title: string; pays_gd: number; status: string }[]
      return { text: `Work I found for you:\n${gigs.map((g) => `• ${g.title} — G$ ${g.pays_gd.toLocaleString()}${g.status === 'accepted' ? ' (in progress)' : ''}`).join('\n')}\n\nOpen the Work tab to take one.`, engine: 'rules' }
    }
    case 'rewards': {
      const p = await rewardProgress(user)
      return { text: `You've earned G$ ${p.earnedGd.toLocaleString()} in rewards.\n${p.items.filter((i) => !i.done).map((i) => `• ${i.title}: ${i.detail} → G$ ${i.amountGd}`).join('\n')}`, engine: 'rules' }
    }
    case 'run': {
      const t = await executeTool(user, 'run_agent', {}, out)
      return { text: t.replace(/^error: /, ''), engine: 'rules' }
    }
    case 'move': {
      const t = await executeTool(user, 'move_to_jar', { jar: intent.jar, amount_ngn: intent.amountNgn }, out)
      return { text: t.startsWith('error') ? "There's no free G$ to move right now." : `Done — ${t.replace('moved', 'moved')} into ${intent.jar}.`, engine: 'rules' }
    }
    default: {
      const light = snap.jars.find((j) => j.kind === 'light')
      const disco = light && isDisco(light.details.disco) ? ` (${DISCO_INFO[light.details.disco].short})` : ''
      return {
        text: `I save your G$, pay airtime, data and light${disco}, find rewards and find you paid work. Try:\n• "₦500 airtime to 0803 123 4567"\n• "1GB data for me"\n• "Buy ₦3000 light"\n• "Find me work"\n• "My rewards"`,
        engine: 'rules',
      }
    }
  }
}

export type { JarKind, PendingAction }
