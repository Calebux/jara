import { NextResponse } from 'next/server'
import { runAgentForAll } from '@/lib/agent/routine'
import { serverConfig } from '@/lib/env'
import { sendMessage } from '@/lib/telegram'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Run the agent for every user, e.g. every 6 hours (claims are once per day). Header: Authorization: Bearer $CRON_SECRET
export async function GET(req: Request) {
  const secret = serverConfig().cronSecret
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const results = await runAgentForAll(async (user, text) => {
    if (user.tgChatId) await sendMessage(user.tgChatId, text)
  })
  return NextResponse.json({ ran: results.length, results })
}
