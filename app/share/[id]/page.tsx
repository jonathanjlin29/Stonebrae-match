import { notFound } from "next/navigation"
import { getRound } from "@/app/actions/rounds"
import { RoundScorecard } from "@/components/round-scorecard"

export const revalidate = 0

export default async function PublicRoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const roundId = Number(id)
  if (!Number.isFinite(roundId)) notFound()

  const round = await getRound(roundId)
  if (!round) notFound()

  return <RoundScorecard round={round} currentPlayerId={null} isPublicView />
}
