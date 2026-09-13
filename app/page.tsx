import { getCurrentPlayer, getPlayers } from "./actions/players"
import { getActiveRoundForPlayer, getActiveRounds, getRecentRounds } from "./actions/rounds"
import { redirect } from "next/navigation"
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

  const activeRoundId = await getActiveRoundForPlayer(player.id)
  if (activeRoundId) redirect(`/round/${activeRoundId}`)

  const [activeRounds, recentRounds] = await Promise.all([getActiveRounds(), getRecentRounds(6)])

  return (
    <main className="min-h-dvh">
      <SiteHeader player={player} />
      <Dashboard player={player} activeRounds={activeRounds} recentRounds={recentRounds} />
    </main>
  )
}
