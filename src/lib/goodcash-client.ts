import { GoodCash, type Bank } from '@goodcash/sdk'
import { serverConfig } from './env'

// The server-side GoodCash client. It uses the SECRET key, so it must only ever run on the server.
// Kept in its own module so tests can swap in a fake.

let cached: { key: string; client: GoodCash } | null = null

export function goodCashServer(): GoodCash {
  const { secretKey } = serverConfig().goodcash
  if (!secretKey.startsWith('gc_sk_')) throw new Error('GOODCASH_SECRET_KEY is not set')
  if (cached?.key !== secretKey) cached = { key: secretKey, client: new GoodCash({ secretKey, rpcUrl: serverConfig().chain.rpcUrl }) }
  return cached.client
}

let bankCache: { at: number; banks: Bank[] } | null = null

/** Nigerian banks, most used first. Cached for an hour: the list rarely changes. */
export async function goodCashBanks(): Promise<Bank[]> {
  if (bankCache && Date.now() - bankCache.at < 3_600_000) return bankCache.banks
  const banks = await goodCashServer().banks()
  bankCache = { at: Date.now(), banks }
  return banks
}
