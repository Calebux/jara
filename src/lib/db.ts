import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { createClient, type Client, type InValue } from '@libsql/client'
import { serverConfig } from './env'

// SQLite locally (file:data/jarra.db), Turso/libSQL in production.
// G$ amounts are stored as wei strings (18 decimals on Celo).
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    session_token TEXT UNIQUE,
    tg_chat_id TEXT UNIQUE,
    link_code TEXT UNIQUE,
    root_address TEXT,
    agent_address TEXT NOT NULL UNIQUE,
    agent_key_enc TEXT NOT NULL,
    connected INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    last_claim_day TEXT,
    pending_action TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS jars (
    user_id TEXT NOT NULL REFERENCES users (id),
    kind TEXT NOT NULL,
    balance_wei TEXT NOT NULL DEFAULT '0',
    target_ngn INTEGER NOT NULL,
    auto_pay INTEGER NOT NULL DEFAULT 0,
    details TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (user_id, kind)
  )`,
  `CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users (id),
    type TEXT NOT NULL,
    jar TEXT,
    amount_wei TEXT,
    amount_ngn INTEGER,
    tx_hash TEXT,
    status TEXT NOT NULL DEFAULT 'done',
    title TEXT NOT NULL,
    detail TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS activity_user_idx ON activity (user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users (id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS messages_user_idx ON messages (user_id, id)`,
  // Simulated balances for CHAIN_MODE=mock.
  `CREATE TABLE IF NOT EXISTS mock_balances (address TEXT PRIMARY KEY, wei TEXT NOT NULL)`,
]

const globalForDb = globalThis as typeof globalThis & { __jarraDb?: Promise<Client> }

export function db(): Promise<Client> {
  globalForDb.__jarraDb ??= connect().catch((err: unknown) => {
    globalForDb.__jarraDb = undefined
    throw err
  })
  return globalForDb.__jarraDb
}

async function connect(): Promise<Client> {
  const { url, authToken } = serverConfig().db
  if (url.startsWith('file:')) mkdirSync(path.dirname(url.slice('file:'.length)), { recursive: true })
  const client = createClient({ url, authToken })
  await client.batch(SCHEMA, 'write')
  return client
}

export async function run(sql: string, args: InValue[] = []) {
  return (await db()).execute({ sql, args })
}
