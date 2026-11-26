/* eslint-disable @typescript-eslint/no-require-imports */
const { test, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { createHash, createHmac } = require('node:crypto')
const directory = mkdtempSync(`${tmpdir()}/jara-refpay-`)
const SECRET = 'whsec_test_secret'
Object.assign(process.env, {
  DATABASE_URL: `file:${directory}/test.db`, CHAIN_MODE: 'mock', TOPUP_PROVIDER: 'mock', GD_NGN_RATE: '1',
  GOODCASH_SECRET_KEY: 'gc_sk_test_fake', GOODCASH_WEBHOOK_SECRET: SECRET, REFERRAL_MILESTONE_FRIENDS: '10', REFERRAL_MILESTONE_NGN: '5000',
})
const { db, run, referralStartingLine } = require('../src/lib/db.ts')
const users = require('../src/lib/users.ts')
const gc = require('../src/lib/goodcash-client.ts')
const payout = require('../src/lib/referral-payout.ts')
const { handleGoodCashWebhook } = require('../src/lib/goodcash.ts')
const { GoodCashError } = require('@goodcash/sdk')

// A fake GoodCash: ₦0.15 per G$ after ~11% fees and a ₦20 bank fee; createCashOut is idempotent by key.
let fake
let seq = 0
function makeFake() {
  const f = { created: [], byKey: new Map(), status: new Map(), simulated: [] }
  f.client = {
    verifyAccount: async ({ accountNumber }) => {
      if (accountNumber === '0000000000') throw new GoodCashError('bank_account_not_found')
      return { accountName: 'ADA OKAFOR' }
    },
    quote: async ({ amountG }) => ({ amountG: String(amountG), feePercent: 11, fees: [{ label: 'GoodDollar contribution', naira: 100 }], receive: { naira: Math.floor(Number(amountG) * 0.15 * 0.89 - 20), minimumNaira: 0 } }),
    createCashOut: async (args) => {
      if (f.byKey.has(args.idempotencyKey)) return f.byKey.get(args.idempotencyKey)
      f.created.push(args)
      const c = { id: `co_${++seq}`, expiresAt: new Date(Date.now() + 600_000).toISOString(), receive: { naira: Math.floor(Number(args.amountG) * 0.15 * 0.89 - 20) }, transaction: { to: '0x62b8b11039fcfe5ab0c56e502b1c372a3d2a9c7a', data: '0x1234' } }
      f.byKey.set(args.idempotencyKey, c)
      return c
    },
    assertSafeTransaction: () => {},
    simulate: async (id) => { f.simulated.push(id) },
    reportTransaction: async () => ({}),
    getCashOut: async (id) => ({ id, status: f.status.get(id) ?? 'processing', receive: { naira: 5000 } }),
  }
  return f
}
beforeEach(() => {
  fake = makeFake()
  gc.goodCashServer = () => fake.client
  gc.goodCashBanks = async () => [{ code: '058', name: 'GTBank', popular: true }]
})

async function person() {
  const user = await users.createUser()
  await users.updateUser(user.id, { connected: true, name: 'Ada Okafor', rootAddress: `0x${createHash('sha256').update(user.id).digest('hex').slice(0, 40)}` })
  return users.getUserById(user.id)
}
async function friends(user, n) {
  const have = Number((await run('SELECT COUNT(*) AS n FROM referral_identities WHERE referrer_id = ?', [user.id])).rows[0].n)
  for (let i = have; i < n; i++) {
    const friend = await users.createUser()
    await run('INSERT INTO referral_identities (root_address, referrer_id, referred_user_id, created_at) VALUES (?, ?, ?, ?)', [`0x${createHash('sha256').update(friend.id).digest('hex').slice(0, 40)}`, user.id, friend.id, Date.now()])
  }
}
const bank = { bankCode: '058', accountNumber: '0123456789' }
const cashouts = async (user) => (await run("SELECT title, amount_ngn FROM activity WHERE user_id = ? AND type = 'cashout'", [user.id])).rows

test('progress counts verified friends; the reward is ready at 10, not before', async () => {
  const user = await person()
  await friends(user, 9)
  let s = await payout.referralRewardState(user)
  assert.equal(s.enabled, true)
  assert.deepEqual([s.ready, s.towardNext, s.friendsPerReward, s.rewardNgn, s.rewardGd], [null, 9, 10, 5000, 5000])
  await assert.rejects(payout.claimReferralReward(user, bank), /unlocks at 10/)
  await friends(user, 10)
  s = await payout.referralRewardState(user)
  assert.deepEqual([s.ready, s.towardNext], [1, 0])
})

test('a wrong account sends nothing; a right one cashes out the G$ worth ₦5,000 once, and the next reward waits for 20 friends', async () => {
  const user = await person()
  await friends(user, 10)
  await assert.rejects(payout.claimReferralReward(user, { bankCode: '058', accountNumber: '0000000000' }), /couldn’t find that account/)
  await assert.rejects(payout.claimReferralReward(user, { bankCode: '058', accountNumber: '123' }), /10-digit/)
  assert.equal(fake.created.length, 0)

  let s = await payout.claimReferralReward(user, bank)
  assert.equal(fake.created.length, 1)
  const made = fake.created[0]
  assert.equal(made.recipient.accountName, 'ADA OKAFOR')
  assert.equal(made.partnerRef, user.id)
  assert.equal(made.idempotencyKey, `jara-referral-${user.id}-1-1`)
  // GD_NGN_RATE=1 in this file: G$ 5,000 is worth ₦5,000. GoodCash's fees come out of it at the bank.
  assert.equal(made.amountG, '5000')
  assert.deepEqual(fake.simulated, [fake.byKey.get(made.idempotencyKey).id])
  assert.equal(s.processing.status, 'processing')
  assert.equal(s.processing.accountEnding, '6789')
  assert.equal(s.ready, null)

  // Claiming again while it is on its way only checks on the same payout.
  await payout.claimReferralReward(user, bank)
  assert.equal(fake.created.length, 1)

  fake.status.set(fake.simulated[0], 'paid')
  await payout.refreshReferralPayout(user)
  await payout.refreshReferralPayout(user)
  s = await payout.referralRewardState(user)
  assert.equal(s.processing, null)
  assert.equal(s.paid.length, 1)
  assert.equal((await cashouts(user)).length, 1)
  await assert.rejects(payout.claimReferralReward(user, bank), /unlocks at 20/)
  await friends(user, 20)
  assert.equal((await payout.referralRewardState(user)).ready, 2)
})

test('a payout GoodCash reports failed can be tried again, with a new identity, and pays once', async () => {
  const user = await person()
  await friends(user, 10)
  await payout.claimReferralReward(user, bank)
  fake.status.set(fake.simulated[0], 'refunded')
  await payout.refreshReferralPayout(user)
  let s = await payout.referralRewardState(user)
  assert.equal(s.ready, 1)
  assert.match(s.lastFailed.error, /nothing was paid/)
  await payout.claimReferralReward(user, bank)
  assert.equal(fake.created.length, 2)
  assert.equal(fake.created[1].idempotencyKey, `jara-referral-${user.id}-1-2`)
  fake.status.set(fake.simulated[1], 'paid')
  await payout.refreshReferralPayout(user)
  s = await payout.referralRewardState(user)
  assert.equal(s.paid.length, 1)
  assert.equal((await cashouts(user)).length, 1)
})

test('the G$ amount follows today’s price, is shown before cashing out, and is fixed once sent', async () => {
  const user = await person()
  await friends(user, 10)
  process.env.GD_NGN_RATE = '0.15'
  try {
    // ₦5,000 at ₦0.15 per G$ = G$ 33,333, rounded to G$ 33,300.
    assert.equal((await payout.referralRewardState(user)).rewardGd, 33300)
    const preview = await payout.previewReferralPayout(user)
    assert.equal(preview.amountGd, 33300)
    assert.equal(preview.receiveNaira, Math.floor(33300 * 0.15 * 0.89 - 20))
    await payout.claimReferralReward(user, bank)
    assert.equal(fake.created[0].amountG, '33300')
    process.env.GD_NGN_RATE = '0.3'
    const s = await payout.referralRewardState(user)
    assert.equal(s.processing.amountGd, 33300)
  } finally { process.env.GD_NGN_RATE = '1' }
})

test('two taps at once start one payout', async () => {
  const user = await person()
  await friends(user, 10)
  await Promise.all([payout.claimReferralReward(user, bank), payout.claimReferralReward(user, bank).catch(() => null)])
  assert.equal(fake.created.length, 1)
})

test('the signed GoodCash webhook settles Jara’s payout, once', async () => {
  const user = await person()
  await friends(user, 10)
  await payout.claimReferralReward(user, bank)
  const event = { id: 'evt_ref_paid', type: 'cashout.paid', data: { id: fake.simulated[0], partnerRef: user.id, wallet: '0x0000000000000000000000000000000000007e57', receive: { naira: 5003 } } }
  const raw = JSON.stringify(event)
  const t = Math.floor(Date.now() / 1000)
  const sig = `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${raw}`).digest('hex')}`
  assert.equal((await handleGoodCashWebhook(raw, sig)).status, 200)
  assert.equal((await handleGoodCashWebhook(raw, sig)).status, 200)
  const s = await payout.referralRewardState(user)
  assert.equal(s.paid[0].receiveNaira, 5003)
  assert.deepEqual((await cashouts(user)).map((r) => Number(r.amount_ngn)), [5003])
})

test('a reward already paid by hand is never paid again', async () => {
  const user = await person()
  await friends(user, 10)
  assert.deepEqual(await payout.markMilestonePaidManually(user.id, 1, 'paid by transfer'), { recorded: true })
  const s = await payout.referralRewardState(user)
  assert.equal(s.ready, null)
  assert.equal(s.paid.length, 1)
  await assert.rejects(payout.claimReferralReward(user, bank), /unlocks at 20/)
  assert.equal(fake.created.length, 0)
})

test('switched off without an amount; live keys never pay out against the simulated chain', async () => {
  const user = await person()
  await friends(user, 10)
  process.env.REFERRAL_MILESTONE_NGN = '0'
  try {
    assert.equal((await payout.referralRewardState(user)).enabled, false)
    await assert.rejects(payout.claimReferralReward(user, bank), /not switched on/)
  } finally { process.env.REFERRAL_MILESTONE_NGN = '5000' }
  process.env.GOODCASH_SECRET_KEY = 'gc_sk_live_fake'
  try {
    await assert.rejects(payout.claimReferralReward(user, bank), /CHAIN_MODE=celo/)
    assert.equal(fake.created.length, 0)
  } finally { process.env.GOODCASH_SECRET_KEY = 'gc_sk_test_fake' }
})

test('starting line: sets of 10 people already had before launch count as paid, once; each new 10 pays', async () => {
  const early = await person(), fresh = await person()
  await friends(early, 13)
  await friends(fresh, 4)
  const client = await db()
  assert.ok(await referralStartingLine(client, 'test-baseline') >= 1)
  assert.equal(await referralStartingLine(client, 'test-baseline'), 0, 'runs once, ever')
  let s = await payout.referralRewardState(early)
  assert.deepEqual([s.ready, s.towardNext, s.paid.length], [null, 3, 1])
  await assert.rejects(payout.claimReferralReward(early, bank), /unlocks at 20/)
  await friends(early, 20)
  assert.equal((await payout.referralRewardState(early)).ready, 2)
  // Someone below 10 at launch keeps their progress and is paid at 10.
  await friends(fresh, 10)
  assert.equal((await payout.referralRewardState(fresh)).ready, 1)
})

after(async () => {
  ;(await db()).close()
  rmSync(directory, { recursive: true, force: true })
})
