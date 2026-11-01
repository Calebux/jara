import { randomBytes } from 'node:crypto'
import { parseEther } from 'viem'
import { sendGdFromTreasury } from './chain'
import { run } from './db'
import { serverConfig } from './env'
import { syncJars, withUserLock } from './jars'
import { getUserById, logActivity, type User } from './users'

// Small jobs paid in G$. The agent matches open gigs to a user's skills and
// city, suggests them quietly, and pays the reward into their jars when done.

export const SKILLS = {
  surveys: 'Surveys',
  typing: 'Typing',
  'data-entry': 'Data entry',
  hausa: 'Hausa',
  yoruba: 'Yoruba',
  igbo: 'Igbo',
  pidgin: 'Pidgin',
  photography: 'Photos',
  delivery: 'Delivery',
  'social-media': 'Social media',
  writing: 'Writing',
  teaching: 'Teaching',
  design: 'Design',
} as const
export type Skill = keyof typeof SKILLS
export const isSkill = (s: unknown): s is Skill => typeof s === 'string' && s in SKILLS

export const CITIES = ['Lagos', 'Abuja', 'Kaduna', 'Kano', 'Ibadan', 'Port Harcourt', 'Enugu', 'Benin', 'Jos'] as const

export type GigStatus = 'suggested' | 'accepted' | 'submitted' | 'paid' | 'dismissed'

export interface Gig {
  id: string
  title: string
  description: string
  rewardGd: number
  skills: Skill[]
  city: string | null
  poster: string
  slots: number
  status?: GigStatus
  proof?: string | null
}

const DEMO_GIGS: Omit<Gig, 'id'>[] = [
  { title: 'Answer a 5-question survey on mobile data prices', description: 'Tell us what you pay for data each month. Takes 3 minutes.', rewardGd: 800, skills: ['surveys'], city: null, poster: 'Kobo Research', slots: 50 },
  { title: 'Translate 20 app phrases into Hausa', description: 'Short buttons and messages for a farming app. Reply with your translations.', rewardGd: 4000, skills: ['hausa'], city: null, poster: 'FarmLink', slots: 3 },
  { title: 'Photograph 3 price boards at your local market', description: 'Clear photos of today’s food prices. Include the market name.', rewardGd: 2500, skills: ['photography'], city: 'Kaduna', poster: 'Market Watch NG', slots: 10 },
  { title: 'Type up a one-page handwritten note', description: 'We send a photo, you type it out exactly. About 15 minutes.', rewardGd: 1500, skills: ['typing', 'data-entry'], city: null, poster: 'Calbridge Labs', slots: 5 },
  { title: 'Record 10 Yoruba sentences for a voice dataset', description: 'Read short sentences aloud and send the voice notes.', rewardGd: 3000, skills: ['yoruba'], city: null, poster: 'OpenVoice Africa', slots: 20 },
  { title: 'Share our clean-water campaign on your status', description: 'Post our flyer for 24 hours and send a screenshot.', rewardGd: 600, skills: ['social-media'], city: null, poster: 'GoodCollective pool', slots: 100 },
  { title: 'Deliver 5 parcels within Abuja Wuse', description: 'Pick up from our hub, drop at 5 shops. Bike or keke.', rewardGd: 9000, skills: ['delivery'], city: 'Abuja', poster: 'QuickDrop', slots: 2 },
  { title: 'Write 3 short product descriptions in Pidgin', description: '50 words each for a provision shop’s WhatsApp catalogue.', rewardGd: 2000, skills: ['pidgin', 'writing'], city: null, poster: 'Mama Put Stores', slots: 4 },
]

let seeded = false
async function ensureSeeded() {
  if (seeded) return
  seeded = true
  const r = await run('SELECT COUNT(*) AS n FROM gigs')
  const demo = serverConfig().chain.mode === 'mock' || process.env.SEED_DEMO_GIGS === 'true'
  if (Number(r.rows[0].n) > 0 || !demo) return
  for (const g of DEMO_GIGS) await createGig(g)
}

export async function createGig(g: Omit<Gig, 'id'>): Promise<string> {
  const id = `g_${randomBytes(5).toString('hex')}`
  await run('INSERT INTO gigs (id, title, description, reward_gd, skills, city, poster, slots, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    id,
    g.title,
    g.description,
    Math.round(g.rewardGd),
    JSON.stringify(g.skills),
    g.city,
    g.poster,
    g.slots,
    Date.now(),
  ])
  return id
}

function toGig(r: Record<string, unknown>): Gig {
  return {
    id: r.id as string,
    title: r.title as string,
    description: r.description as string,
    rewardGd: Number(r.reward_gd),
    skills: JSON.parse(r.skills as string) as Skill[],
    city: (r.city as string) ?? null,
    poster: r.poster as string,
    slots: Number(r.slots),
    status: (r.status as GigStatus) ?? undefined,
    proof: (r.proof as string) ?? null,
  }
}

/** Gigs the agent has put in front of this user (suggested, accepted, submitted, paid). */
export async function userGigs(userId: string): Promise<Gig[]> {
  await ensureSeeded()
  const r = await run(
    `SELECT g.*, c.status, c.proof FROM gig_claims c JOIN gigs g ON g.id = c.gig_id
     WHERE c.user_id = ? AND c.status != 'dismissed' ORDER BY CASE c.status WHEN 'accepted' THEN 0 WHEN 'suggested' THEN 1 WHEN 'submitted' THEN 2 ELSE 3 END, c.score DESC`,
    [userId],
  )
  return r.rows.map((x) => toGig(x as unknown as Record<string, unknown>))
}

/** Score open gigs against the user's skills and city and suggest the best new ones. */
export async function matchGigs(user: User, max = 2): Promise<Gig[]> {
  await ensureSeeded()
  const r = await run(
    `SELECT g.* FROM gigs g
     WHERE g.active = 1
       AND NOT EXISTS (SELECT 1 FROM gig_claims c WHERE c.gig_id = g.id AND c.user_id = ?)
       AND (SELECT COUNT(*) FROM gig_claims c2 WHERE c2.gig_id = g.id AND c2.status IN ('accepted','submitted','paid')) < g.slots`,
    [user.id],
  )
  const skills = new Set(user.skills)
  const scored = r.rows
    .map((x) => toGig(x as unknown as Record<string, unknown>))
    .map((g) => {
      const overlap = g.skills.filter((s) => skills.has(s)).length
      const cityOk = !g.city || (user.city && g.city.toLowerCase() === user.city.toLowerCase())
      if (!cityOk) return { g, score: 0 }
      // Anyone can do a survey; everything else needs a matching skill.
      const open = g.skills.includes('surveys') || g.skills.includes('social-media')
      const score = overlap * 2 + (g.city ? 1 : 0) + (open ? 0.5 : 0)
      return { g, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.g.rewardGd - a.g.rewardGd)
    .slice(0, max)

  for (const { g, score } of scored) {
    await run('INSERT INTO gig_claims (gig_id, user_id, status, score, updated_at) VALUES (?, ?, ?, ?, ?)', [g.id, user.id, 'suggested', score, Date.now()])
    await logActivity(user.id, { type: 'work', title: `Found you work: ${g.title}`, detail: `Pays G$ ${g.rewardGd.toLocaleString()} · ${g.poster}` })
  }
  return scored.map((x) => x.g)
}

async function setStatus(userId: string, gigId: string, status: GigStatus, proof?: string) {
  const r = await run('UPDATE gig_claims SET status = ?, proof = COALESCE(?, proof), updated_at = ? WHERE gig_id = ? AND user_id = ?', [
    status,
    proof ?? null,
    Date.now(),
    gigId,
    userId,
  ])
  return r.rowsAffected > 0
}

async function getGig(gigId: string): Promise<Gig | null> {
  const r = await run('SELECT * FROM gigs WHERE id = ?', [gigId])
  return r.rows[0] ? toGig(r.rows[0] as unknown as Record<string, unknown>) : null
}

export async function acceptGig(user: User, gigId: string): Promise<string> {
  const gig = await getGig(gigId)
  if (!gig || !(await setStatus(user.id, gigId, 'accepted'))) return 'I could not find that gig.'
  return `You’re on it 💪 “${gig.title}”. ${gig.description} When you’re done, send me your proof and I’ll collect your G$ ${gig.rewardGd.toLocaleString()}.`
}

export async function dismissGig(user: User, gigId: string) {
  await setStatus(user.id, gigId, 'dismissed')
}

/** User says they finished. In demo mode the poster approves instantly. */
export async function submitGig(user: User, gigId: string, proof: string): Promise<string> {
  const gig = await getGig(gigId)
  if (!gig || !(await setStatus(user.id, gigId, 'submitted', proof.slice(0, 500)))) return 'I could not find that gig.'
  if (serverConfig().chain.mode === 'mock') return approveGig(user.id, gigId)
  return `Sent to ${gig.poster} for checking. I’ll drop G$ ${gig.rewardGd.toLocaleString()} into your jars once they approve.`
}

/** Poster approves: G$ reward goes to the worker's jar wallet. */
export async function approveGig(userId: string, gigId: string): Promise<string> {
  const user = await getUserById(userId)
  const gig = await getGig(gigId)
  if (!user || !gig) return 'Unknown gig or user.'
  return withUserLock(user.id, async () => {
    const amount = parseEther(String(gig.rewardGd))
    const hash = await sendGdFromTreasury(user.agentAddress, amount)
    await setStatus(user.id, gigId, 'paid')
    await logActivity(user.id, { type: 'earn', amountWei: amount.toString(), txHash: hash, title: `Earned G$ ${gig.rewardGd.toLocaleString()} — ${gig.title}`, detail: `Paid by ${gig.poster}` })
    await syncJars(user)
    return `Approved ✅ G$ ${gig.rewardGd.toLocaleString()} from ${gig.poster} is now in your jars.`
  })
}
