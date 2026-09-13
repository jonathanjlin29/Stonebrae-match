import { notFound } from "next/navigation"
import { getRound } from "@/app/actions/rounds"
import { getCurrentPlayer } from "@/app/actions/players"
import { SiteHeader } from "@/components/site-header"
import { RoundScorecard } from "@/components/round-scorecard"

export default async function RoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const roundId = Number(id)
  if (!Number.isFinite(roundId)) notFound()

  const [round, currentPlayer] = await Promise.all([getRound(roundId), getCurrentPlayer()])
  if (!round) notFound()

  return (
    <div className="min-h-dvh">
      <SiteHeader player={currentPlayer} />
      <RoundScorecard round={round} currentPlayerId={currentPlayer?.id ?? null} />
    </div>
  )
}
