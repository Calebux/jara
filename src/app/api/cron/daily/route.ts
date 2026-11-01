import { NextResponse } from 'next/server'
import { runDailyForAll } from '@/lib/daily'
import { serverConfig } from '@/lib/env'
import { sendMessage } from '@/lib/telegram'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Run once a day (e.g. Vercel cron 07:00 Lagos). Header: Authorization: Bearer $CRON_SECRET
export async function GET(req: Request) {
  const secret = serverConfig().cronSecret
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const results = await runDailyForAll(async (user, text) => {
    if (user.tgChatId) await sendMessage(user.tgChatId, `Good morning${user.name ? `, ${user.name}` : ''} 🌅\n${text}`)
  })
  return NextResponse.json({ ran: results.length, results })
}
