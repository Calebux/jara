import type { Metadata } from 'next'
import { StreakLeaderboardPage } from '@/components/StreakGame'

export const metadata: Metadata = { title: 'Jara Streak leaderboard — Campus Bounty' }

export default function StreakLeaderboard() {
  return <StreakLeaderboardPage />
}
