import { NextResponse } from 'next/server'
import { acceptGig, dismissGig, submitGig } from '@/lib/gigs'
import { requireUser } from '@/lib/session'
import { getUserById } from '@/lib/users'
import { bad, userState } from '../_shared'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const body = (await req.json().catch(() => ({}))) as { action?: string; gigId?: string; proof?: string }
  if (typeof body.gigId !== 'string') return bad('Which gig?')
  let message = ''
  if (body.action === 'accept') message = await acceptGig(user, body.gigId)
  else if (body.action === 'dismiss') await dismissGig(user, body.gigId)
  else if (body.action === 'submit') message = await submitGig(user, body.gigId, (body.proof ?? '').trim() || 'Done')
  else return bad('Unknown action')
  return NextResponse.json({ message, state: await userState((await getUserById(user.id))!) })
}
