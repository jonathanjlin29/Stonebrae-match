import { getCurrentPlayer, getPlayers } from "./actions/players"
import { getActiveRounds, getRecentRounds } from "./actions/rounds"
import { PlayerGate } from "@/components/player-gate"
import { Dashboard } from "@/components/dashboard"
import { SiteHeader } from "@/components/site-header"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const player = await getCurrentPlayer()

  if (!player) {
    const players = await getPlayers()
    return (
      <main className="min-h-dvh">
        <SiteHeader />
        <PlayerGate players={players} />
      </main>
    )
  }

  const [activeRounds, recentRounds] = await Promise.all([getActiveRounds(), getRecentRounds(6)])

  return (
    <main className="min-h-dvh">
      <SiteHeader player={player} />
      <Dashboard player={player} activeRounds={activeRounds} recentRounds={recentRounds} />
    </main>
  )
}
