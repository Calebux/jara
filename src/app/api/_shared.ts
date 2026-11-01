import { NextResponse } from 'next/server'
import { listMessages } from '@/lib/agent'
import { llmReachable } from '@/lib/agent/llm'
import { serverConfig } from '@/lib/env'
import { snapshot } from '@/lib/jars'
import { botLink } from '@/lib/telegram'
import { listActivity, type User } from '@/lib/users'

export async function userState(user: User) {
  const cfg = serverConfig()
  const [snap, activity, messages, llmUp] = await Promise.all([snapshot(user), listActivity(user.id, 20), listMessages(user.id), llmReachable()])
  return {
    user: {
      id: user.id,
      name: user.name,
      rootAddress: user.rootAddress,
      agentAddress: user.agentAddress,
      connected: user.connected,
      streak: user.streak,
      telegramLinked: Boolean(user.tgChatId),
      telegramLink: botLink(user.linkCode),
      hasPending: Boolean(user.pending),
    },
    snapshot: snap,
    activity,
    messages,
    config: {
      chainMode: cfg.chain.mode,
      provider: cfg.provider,
      llm: !llmUp ? 'rules' : cfg.llm.baseUrl.includes(':8377') ? 'antseed' : 'llm',
    },
  }
}

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}
