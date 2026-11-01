import { NextResponse } from 'next/server'
import { runAgent } from '@/lib/agent/routine'
import { requireUser } from '@/lib/session'
import { getUserById } from '@/lib/users'
import { bad, userState } from '../../_shared'

export const dynamic = 'force-dynamic'

// Run the agent's routine now (the cron runs it on a schedule).
export async function POST() {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  if (!user.connected) return bad('Connect your GoodDollar account first.')
  try {
    const r = await runAgent(user.id)
    return NextResponse.json({ steps: r.steps, message: r.message, state: await userState((await getUserById(user.id))!) })
  } catch (err) {
    console.error('[agent/run]', err)
    return bad('Jara hit a snag. Try again shortly.', 502)
  }
}
