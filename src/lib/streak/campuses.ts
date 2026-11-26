// Campuses for the school leaderboard. Shared by the server (validation) and the game screen.
export const CAMPUSES = [
  'UNILAG', 'UI (Ibadan)', 'OAU (Ife)', 'UNN (Nsukka)', 'ABU (Zaria)', 'UNIBEN', 'LASU', 'UNILORIN', 'UNIPORT', 'UNIZIK',
  'UNICAL', 'UNIUYO', 'UNIJOS', 'BUK (Kano)', 'UNIMAID', 'UDUS (Sokoto)', 'UniAbuja', 'FUTA (Akure)', 'FUTO (Owerri)', 'FUT Minna',
  'FUNAAB', 'LAUTECH', 'DELSU', 'EKSU', 'OOU', 'FUOYE', 'KWASU', 'RSU', 'NDU', 'IMSU', 'ABSU', 'ESUT', 'Benue State University',
  'Covenant University', 'Babcock University', 'ABUAD', 'Bowen University', 'Landmark University', 'Redeemer’s University', 'Pan-Atlantic University',
  'American University of Nigeria', 'Yabatech', 'LASUSTECH', 'Auchi Poly', 'The Polytechnic, Ibadan', 'Kaduna Poly', 'Another school', 'Not in school',
] as const

export type Campus = (typeof CAMPUSES)[number]

export function isCampus(value: unknown): value is Campus {
  return typeof value === 'string' && (CAMPUSES as readonly string[]).includes(value)
}
