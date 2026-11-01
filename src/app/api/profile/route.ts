import { NextResponse } from 'next/server'
import { CITIES, isSkill } from '@/lib/gigs'
import { requireUser } from '@/lib/session'
import { getUserById, updateUser } from '@/lib/users'
import { userState } from '../_shared'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const body = (await req.json().catch(() => ({}))) as { skills?: unknown[]; city?: string }
  const skills = Array.isArray(body.skills) ? body.skills.filter(isSkill).slice(0, 10) : user.skills
  const city = typeof body.city === 'string' && (CITIES as readonly string[]).includes(body.city) ? body.city : body.city === '' ? null : user.city
  await updateUser(user.id, { skills, city })
  return NextResponse.json(await userState((await getUserById(user.id))!))
}
