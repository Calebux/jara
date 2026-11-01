import type { Metadata } from 'next'
import { TreasuryClient } from './TreasuryClient'

export const metadata: Metadata = { title: 'Treasury — Jarra', robots: { index: false } }

export default function TreasuryPage() {
  return <TreasuryClient />
}
