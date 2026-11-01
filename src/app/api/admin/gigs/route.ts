import { NextResponse } from 'next/server'
import { approveGig, createGig, isSkill } from '@/lib/gigs'

export const dynamic = 'force-dynamic'

// Partner/admin API: post a gig, or approve a worker's submission (pays G$ from treasury).
// Header: Authorization: Bearer $ADMIN_KEY
function authed(req: Request) {
  const key = process.env.ADMIN_KEY
  return Boolean(key) && req.headers.get('authorization') === `Bearer ${key}`
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (b.action === 'approve' && typeof b.gigId === 'string' && typeof b.userId === 'string') {
    return NextResponse.json({ message: await approveGig(b.userId, b.gigId) })
  }
  if (typeof b.title !== 'string' || typeof b.description !== 'string' || typeof b.rewardGd !== 'number' || typeof b.poster !== 'string') {
    return NextResponse.json({ error: 'title, description, rewardGd, poster required' }, { status: 400 })
  }
  const id = await createGig({
    title: b.title,
    description: b.description,
    rewardGd: b.rewardGd,
    skills: Array.isArray(b.skills) ? b.skills.filter(isSkill) : [],
    city: typeof b.city === 'string' ? b.city : null,
    poster: b.poster,
    slots: typeof b.slots === 'number' ? b.slots : 1,
  })
  return NextResponse.json({ id })
}
