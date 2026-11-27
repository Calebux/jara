import type { StreakQuestion } from './questions'

// Questions the game builds itself, so it never runs out. Every one has a right answer that is
// calculated (or looked up in the fixed table below), never guessed, and a tempting wrong answer
// close to it. The question is encoded entirely in its id (gen:<kind>:<numbers>), so the server can
// rebuild it from a stored run at any time without keeping it anywhere else.

/** An integer in [0, n). */
export type Rand = (n: number) => number

type Built = { topic: string; prompt: string; right: string; wrong: string }

const fmt = (n: number) => n.toLocaleString('en-US')
const naira = (n: number) => `₦${fmt(n)}`
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const CONTINENTS = ['Africa', 'Europe', 'Asia', 'North America', 'South America', 'Oceania'] as const

// [country, capital, continent index or -1 when the country spans two]. Append only: ids point at
// positions in this list.
export const COUNTRIES: readonly (readonly [string, string, number])[] = [
  ['Nigeria', 'Abuja', 0], ['Ghana', 'Accra', 0], ['Kenya', 'Nairobi', 0], ['Egypt', 'Cairo', 0], ['Ethiopia', 'Addis Ababa', 0],
  ['Senegal', 'Dakar', 0], ['Morocco', 'Rabat', 0], ['Tanzania', 'Dodoma', 0], ['Uganda', 'Kampala', 0], ['Rwanda', 'Kigali', 0],
  ['Cameroon', 'Yaoundé', 0], ['Zimbabwe', 'Harare', 0], ['Zambia', 'Lusaka', 0], ['Angola', 'Luanda', 0], ['Algeria', 'Algiers', 0],
  ['Tunisia', 'Tunis', 0], ['Libya', 'Tripoli', 0], ['Sudan', 'Khartoum', 0], ['Mali', 'Bamako', 0], ['Niger', 'Niamey', 0],
  ['Chad', 'N’Djamena', 0], ['Togo', 'Lomé', 0], ['Liberia', 'Monrovia', 0], ['Sierra Leone', 'Freetown', 0], ['the Gambia', 'Banjul', 0],
  ['Botswana', 'Gaborone', 0], ['Namibia', 'Windhoek', 0], ['Mozambique', 'Maputo', 0], ['Malawi', 'Lilongwe', 0], ['Somalia', 'Mogadishu', 0],
  ['DR Congo', 'Kinshasa', 0], ['Burkina Faso', 'Ouagadougou', 0], ['Guinea', 'Conakry', 0],
  ['France', 'Paris', 1], ['the United Kingdom', 'London', 1], ['Germany', 'Berlin', 1], ['Italy', 'Rome', 1], ['Spain', 'Madrid', 1],
  ['Portugal', 'Lisbon', 1], ['the Netherlands', 'Amsterdam', 1], ['Belgium', 'Brussels', 1], ['Switzerland', 'Bern', 1], ['Austria', 'Vienna', 1],
  ['Greece', 'Athens', 1], ['Sweden', 'Stockholm', 1], ['Norway', 'Oslo', 1], ['Denmark', 'Copenhagen', 1], ['Finland', 'Helsinki', 1],
  ['Ireland', 'Dublin', 1], ['Poland', 'Warsaw', 1], ['Ukraine', 'Kyiv', 1], ['Hungary', 'Budapest', 1], ['Czechia', 'Prague', 1],
  ['Russia', 'Moscow', -1], ['Turkey', 'Ankara', -1],
  ['Japan', 'Tokyo', 2], ['China', 'Beijing', 2], ['India', 'New Delhi', 2], ['South Korea', 'Seoul', 2], ['Thailand', 'Bangkok', 2],
  ['Vietnam', 'Hanoi', 2], ['the Philippines', 'Manila', 2], ['Malaysia', 'Kuala Lumpur', 2], ['Saudi Arabia', 'Riyadh', 2], ['the United Arab Emirates', 'Abu Dhabi', 2],
  ['Qatar', 'Doha', 2], ['Iran', 'Tehran', 2], ['Iraq', 'Baghdad', 2], ['Pakistan', 'Islamabad', 2], ['Bangladesh', 'Dhaka', 2],
  ['Afghanistan', 'Kabul', 2], ['Nepal', 'Kathmandu', 2],
  ['the United States', 'Washington, D.C.', 3], ['Canada', 'Ottawa', 3], ['Mexico', 'Mexico City', 3], ['Cuba', 'Havana', 3], ['Jamaica', 'Kingston', 3],
  ['Brazil', 'Brasília', 4], ['Argentina', 'Buenos Aires', 4], ['Chile', 'Santiago', 4], ['Peru', 'Lima', 4], ['Colombia', 'Bogotá', 4], ['Venezuela', 'Caracas', 4],
  ['Australia', 'Canberra', 5], ['New Zealand', 'Wellington', 5],
]

/** A number near `right`: off by one of `steps`, up or down; never `right`, never below 1. */
function near(right: number, rand: Rand, steps: number[]): number {
  for (let i = 0; i < 8; i++) {
    const step = steps[rand(steps.length)]
    const w = right + (rand(2) ? step : -step)
    if (w >= 1 && w !== right) return w
  }
  return right + steps[0]
}
const between = (rand: Rand, lo: number, hi: number) => lo + rand(hi - lo + 1)
/** “the Gambia” inside a sentence, “The Gambia” as an answer. */
const asAnswer = (name: string) => name[0].toUpperCase() + name.slice(1)
const pick = <T>(rand: Rand, list: readonly T[]) => list[rand(list.length)]
const sameContinent = (i: number, rand: Rand) => {
  const c = COUNTRIES[i][2]
  const pool = COUNTRIES.map((_, j) => j).filter((j) => j !== i && (c < 0 || COUNTRIES[j][2] === c))
  return pick(rand, pool)
}

type Kind = { weight: number; make: (rand: Rand) => number[]; build: (a: number[]) => Built | null }

const ok = (...n: number[]) => n.every((x) => Number.isSafeInteger(x))

const KINDS: Record<string, Kind> = {
  // 14 × 7 = ?
  mul: {
    weight: 3,
    make: (r) => { const a = between(r, 6, 19), b = between(r, 3, 12); return [a, b, near(a * b, r, [a, b, 10, 2])] },
    build: ([a, b, w]) => ok(a, b, w) && w !== a * b ? { topic: 'Quick maths', prompt: `${a} × ${b} = ?`, right: fmt(a * b), wrong: fmt(w) } : null,
  },
  // 6 + 4 × 3 = ?  (the trap: doing the + first)
  ord: {
    weight: 2,
    make: (r) => [between(r, 2, 12), between(r, 2, 9), between(r, 2, 9)],
    build: ([a, b, c]) => ok(a, b, c) && a > 0 ? { topic: 'Quick maths', prompt: `${a} + ${b} × ${c} = ?`, right: fmt(a + b * c), wrong: fmt((a + b) * c) } : null,
  },
  // 17² = ?
  sq: {
    weight: 1,
    make: (r) => { const a = between(r, 11, 25); return [a, near(a * a, r, [a, 10, 20])] },
    build: ([a, w]) => ok(a, w) && w !== a * a ? { topic: 'Quick maths', prompt: `${a}² = ?`, right: fmt(a * a), wrong: fmt(w) } : null,
  },
  // 15% of 640 = ?
  pct: {
    weight: 2,
    make: (r) => { const p = pick(r, [10, 15, 20, 25, 30, 40, 75]), n = 20 * between(r, 3, 45); return [p, n, near((n * p) / 100, r, [n / 20, n / 10, 10])] },
    build: ([p, n, w]) => ok(p, n, w, (n * p) / 100) && w !== (n * p) / 100 ? { topic: 'Quick maths', prompt: `${p}% of ${fmt(n)} = ?`, right: fmt((n * p) / 100), wrong: fmt(w) } : null,
  },
  // Which is bigger: 3/8 or 2/5?
  frac: {
    weight: 2,
    // Close together, so it takes a second's thought (e.g. 5/8 or 3/5).
    make: (r) => {
      let best = [1, 2, 2, 3]
      for (let t = 0; t < 40; t++) {
        const b = between(r, 3, 12), d = between(r, 3, 12), a = between(r, 1, b - 1), c = between(r, 1, d - 1)
        const gap = Math.abs(a / b - c / d)
        best = [a, b, c, d]
        if (gap > 0 && gap <= 0.12) break
      }
      return best
    },
    build: ([a, b, c, d]) => {
      if (!ok(a, b, c, d) || a >= b || c >= d || a * d === c * b) return null
      const [big, small] = a * d > c * b ? [`${a}/${b}`, `${c}/${d}`] : [`${c}/${d}`, `${a}/${b}`]
      return { topic: 'Quick maths', prompt: 'Which is bigger?', right: big, wrong: small }
    },
  },
  // Which is bigger: 13 × 7 or 95?
  cmp: {
    weight: 1,
    make: (r) => { const a = between(r, 6, 15), b = between(r, 4, 12); return [a, b, a * b + (r(2) ? 1 : -1) * between(r, 1, 6)] },
    build: ([a, b, c]) => {
      if (!ok(a, b, c) || c === a * b || c < 1) return null
      return a * b > c ? { topic: 'Quick maths', prompt: 'Which is bigger?', right: `${a} × ${b}`, wrong: fmt(c) } : { topic: 'Quick maths', prompt: 'Which is bigger?', right: fmt(c), wrong: `${a} × ${b}` }
    },
  },
  // What comes next: 4, 11, 18, 25, …?
  seq: {
    weight: 2,
    make: (r) => { const s = between(r, 1, 30), d = between(r, 3, 13); return [s, d, near(s + 4 * d, r, [1, 2, d])] },
    build: ([s, d, w]) => ok(s, d, w) && w !== s + 4 * d ? { topic: 'Patterns', prompt: `What comes next: ${[0, 1, 2, 3].map((k) => s + k * d).join(', ')}, …?`, right: fmt(s + 4 * d), wrong: fmt(w) } : null,
  },
  // What comes next: 3, 6, 12, 24, …?
  dbl: {
    weight: 1,
    make: (r) => { const s = between(r, 2, 9), m = between(r, 2, 3); const right = s * m ** 4; return [s, m, near(right, r, [s * m ** 3, s])] },
    build: ([s, m, w]) => ok(s, m, w) && w !== s * m ** 4 ? { topic: 'Patterns', prompt: `What comes next: ${[0, 1, 2, 3].map((k) => s * m ** k).join(', ')}, …?`, right: fmt(s * m ** 4), wrong: fmt(w) } : null,
  },
  // What day is 10 days after Tuesday?
  dow: {
    weight: 2,
    make: (r) => { const s = r(7), n = between(r, 2, 20); return [s, n, (s + n + pick(r, [1, 6])) % 7] },
    build: ([s, n, w]) => ok(s, n, w) && s >= 0 && s < 7 && w >= 0 && w < 7 && w !== (s + n) % 7
      ? { topic: 'Time', prompt: `What day is ${n} days after ${DAYS[s]}?`, right: DAYS[(s + n) % 7], wrong: DAYS[w] } : null,
  },
  // How many minutes in 3¾ hours? / How many hours in 6 days?
  time: {
    weight: 1,
    make: (r) => { const q = between(r, 5, 39); return [q, near(q * 15, r, [15, 30, 10])] },
    build: ([q, w]) => ok(q, w) && w !== q * 15 ? { topic: 'Time', prompt: `How many minutes in ${hours(q)}?`, right: fmt(q * 15), wrong: fmt(w) } : null,
  },
  // You pay ₦2,000 for something that costs ₦1,350. Your change?
  chg: {
    weight: 2,
    make: (r) => {
      const x = pick(r, [500, 1000, 2000, 5000, 10000]), y = 50 * between(r, 1, x / 50 - 1)
      let w = near(x - y, r, [50, 100])
      if (w >= x) w = x - y - 50 > 0 ? x - y - 50 : x - y + 50
      return [x, y, w]
    },
    build: ([x, y, w]) => ok(x, y, w) && y < x && w !== x - y && w < x ? { topic: 'Money', prompt: `You pay ${naira(x)} for something that costs ${naira(y)}. Your change?`, right: naira(x - y), wrong: naira(w) } : null,
  },
  // 3 pens cost ₦450. How much for 7?
  unit: {
    weight: 2,
    make: (r) => { const n = between(r, 2, 6), p = 50 * between(r, 1, 12); let m = between(r, 2, 12); if (m === n) m += 1; return [n, p, m, near(m * p, r, [p, 50])] },
    build: ([n, p, m, w]) => ok(n, p, m, w) && n !== m && w !== m * p ? { topic: 'Money', prompt: `${n} pens cost ${naira(n * p)}. How much for ${m}?`, right: naira(m * p), wrong: naira(w) } : null,
  },
  // G$ 20 for every correct answer. How much for 13?
  gd: {
    weight: 1,
    make: (r) => { const n = between(r, 4, 25); return [n, near(20 * n, r, [20, 40])] },
    build: ([n, w]) => ok(n, w) && w !== 20 * n ? { topic: 'Money', prompt: `G$ 20 for every correct answer. How much for ${n} correct?`, right: `G$ ${fmt(20 * n)}`, wrong: `G$ ${fmt(w)}` } : null,
  },
  // Capital of Mali?
  cap: {
    weight: 3,
    make: (r) => { const i = r(COUNTRIES.length); return [i, sameContinent(i, r)] },
    build: ([i, j]) => COUNTRIES[i] && COUNTRIES[j] && i !== j ? { topic: 'World', prompt: `Capital of ${COUNTRIES[i][0]}?`, right: COUNTRIES[i][1], wrong: COUNTRIES[j][1] } : null,
  },
  // Lusaka is the capital of…
  capr: {
    weight: 2,
    make: (r) => { const i = r(COUNTRIES.length); return [i, sameContinent(i, r)] },
    build: ([i, j]) => COUNTRIES[i] && COUNTRIES[j] && i !== j ? { topic: 'World', prompt: `${COUNTRIES[i][1]} is the capital of…`, right: asAnswer(COUNTRIES[i][0]), wrong: asAnswer(COUNTRIES[j][0]) } : null,
  },
  // Which continent is Peru in?
  cont: {
    weight: 1,
    make: (r) => {
      const pool = COUNTRIES.map((_, j) => j).filter((j) => COUNTRIES[j][2] >= 0)
      const i = pick(r, pool), c = COUNTRIES[i][2]
      return [i, pick(r, CONTINENTS.map((_, k) => k).filter((k) => k !== c))]
    },
    build: ([i, k]) => {
      const c = COUNTRIES[i]?.[2]
      return c !== undefined && c >= 0 && CONTINENTS[k] && k !== c ? { topic: 'World', prompt: `Which continent is ${COUNTRIES[i][0]} in?`, right: CONTINENTS[c], wrong: CONTINENTS[k] } : null
    },
  },
}

function hours(quarters: number): string {
  const h = Math.floor(quarters / 4), q = quarters % 4
  const frac = ['', '¼', '½', '¾'][q]
  return `${h}${frac} hour${h === 1 && !frac ? '' : 's'}`
}

const TOTAL = Object.values(KINDS).reduce((s, k) => s + k.weight, 0)

export const isGenerated = (id: string) => id.startsWith('gen:')

/** Rebuild a generated question from its id, or null if the id isn't a valid one. */
export function generatedQuestion(id: string): StreakQuestion | null {
  const [prefix, kind, ...rest] = id.split(':')
  const k = KINDS[kind]
  if (prefix !== 'gen' || !k || rest.length === 0 || rest.some((x) => !/^\d+$/.test(x))) return null
  const built = k.build(rest.map(Number))
  if (!built || built.right === built.wrong) return null
  return { id, topic: built.topic, prompt: built.prompt, options: [built.right, built.wrong] as const }
}

/** A fresh generated question id. */
export function randomGenerated(rand: Rand): string {
  for (let tries = 0; tries < 20; tries++) {
    let roll = rand(TOTAL)
    const [name, kind] = Object.entries(KINDS).find(([, k]) => (roll -= k.weight) < 0)!
    const id = `gen:${name}:${kind.make(rand).join(':')}`
    if (generatedQuestion(id)) return id
  }
  return 'gen:mul:7:8:54'
}
