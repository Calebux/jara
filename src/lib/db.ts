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
  // Gigs: small jobs paid in G$. Funded up front by the poster (or the Jarra treasury).
  `CREATE TABLE IF NOT EXISTS gigs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    reward_gd INTEGER NOT NULL,
    skills TEXT NOT NULL DEFAULT '[]',
    city TEXT,
    poster TEXT NOT NULL,
    slots INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS gig_claims (
    gig_id TEXT NOT NULL REFERENCES gigs (id),
    user_id TEXT NOT NULL REFERENCES users (id),
    status TEXT NOT NULL,
    proof TEXT,
    score REAL NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (gig_id, user_id)
  )`,
  // One row per reward a user has received, keyed so each reward pays once per period.
  `CREATE TABLE IF NOT EXISTS rewards_paid (
    user_id TEXT NOT NULL REFERENCES users (id),
    reward_key TEXT NOT NULL,
    amount_gd INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, reward_key)
  )`,
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
  // Columns added after the first release.
  for (const sql of [
    'ALTER TABLE users ADD COLUMN skills TEXT NOT NULL DEFAULT \'[]\'',
    'ALTER TABLE users ADD COLUMN city TEXT',
    'ALTER TABLE users ADD COLUMN referred_by TEXT',
    'ALTER TABLE users ADD COLUMN last_run_at INTEGER',
    'ALTER TABLE jars ADD COLUMN every_days INTEGER',
    'ALTER TABLE jars ADD COLUMN last_paid_at INTEGER',
  ]) {
    try {
      await client.execute(sql)
    } catch {
      /* column already exists */
    }
  }
  return client
}

export async function run(sql: string, args: InValue[] = []) {
  return (await db()).execute({ sql, args })
}
