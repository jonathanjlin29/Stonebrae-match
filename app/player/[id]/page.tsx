import { notFound } from "next/navigation"
import { Flame, TrendingUp, Coins, Swords, BarChart3 } from "lucide-react"
import { getPlayerAnalytics } from "@/app/actions/analytics"
import { getCurrentPlayer, getPlayerById } from "@/app/actions/players"
import { SiteHeader } from "@/components/site-header"
import { NicknameEditor } from "@/components/nickname-editor"
import { Card } from "@/components/ui"
import { formatMoney, moneyClass, playerLabel } from "@/lib/util"

export const revalidate = 0

export default async function PlayerStatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const playerId = Number(id)
  if (!Number.isFinite(playerId)) notFound()

  const [player, stats, currentPlayer] = await Promise.all([
    getPlayerById(playerId),
    getPlayerAnalytics(playerId),
    getCurrentPlayer(),
  ])
  if (!player) notFound()

  const bounceBackPct = stats.bounceBackRate != null ? Math.round(stats.bounceBackRate * 100) : null
  const pressWinPct = stats.pressesPlayed > 0 ? Math.round((stats.pressesWon / stats.pressesPlayed) * 100) : null

  return (
    <div className="min-h-dvh">
      <SiteHeader player={currentPlayer} />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center gap-2">
          <BarChart3 className="h-7 w-7 text-[var(--color-primary)]" />
          <h1 className="font-display text-4xl">{playerLabel(player)}</h1>
        </div>

        {currentPlayer?.id === player.id && <NicknameEditor currentNickname={player.nickname} />}

        {stats.roundsPlayed === 0 ? (
          <Card className="p-8 text-center text-[var(--color-muted)]">
            No completed rounds yet. Stats will show up once a round wraps up.
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard
              icon={<Coins className="h-5 w-5 text-[var(--color-gold)]" />}
              label="Total winnings"
              value={<span className={moneyClass(stats.totalMoney)}>{formatMoney(stats.totalMoney)}</span>}
              sub={`${stats.roundsPlayed} completed ${stats.roundsPlayed === 1 ? "round" : "rounds"}`}
            />
            <StatCard
              icon={<Swords className="h-5 w-5 text-[var(--color-gold)]" />}
              label="Press record"
              value={`${stats.pressesWon}-${stats.pressesLost}`}
              sub={pressWinPct != null ? `${pressWinPct}% win rate over ${stats.pressesPlayed} presses` : "No presses yet"}
            />
            <StatCard
              label="Front nine"
              value={stats.frontVsPar != null ? relLabel(stats.frontVsPar) : "—"}
              sub={stats.frontAvg != null ? `avg ${stats.frontAvg.toFixed(1)} strokes / 9` : "No holes recorded"}
            />
            <StatCard
              label="Back nine"
              value={stats.backVsPar != null ? relLabel(stats.backVsPar) : "—"}
              sub={stats.backAvg != null ? `avg ${stats.backAvg.toFixed(1)} strokes / 9` : "No holes recorded"}
            />
            <StatCard
              icon={<TrendingUp className="h-5 w-5 text-[var(--color-primary)]" />}
              label="Bounce backs"
              value={`${stats.bounceBacks} / ${stats.bounceBackOpportunities}`}
              sub={bounceBackPct != null ? `${bounceBackPct}% recovery rate after a bogey` : "No bogeys yet — nothing to bounce back from"}
            />
            <StatCard
              icon={<Flame className="h-5 w-5 text-[var(--color-danger)] animate-flame" />}
              label="Fire Hot streaks"
              value={stats.fireHotStreaks}
              sub={`Longest streak: ${stats.longestBirdieStreak} birdies in a row`}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function relLabel(vsPar: number) {
  if (vsPar === 0) return "Even par"
  return vsPar > 0 ? `+${vsPar}` : `${vsPar}`
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon?: React.ReactNode
  label: string
  value: React.ReactNode
  sub: string
}) {
  return (
    <Card className="animate-pop p-5">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--color-muted)]">
        {icon}
        {label}
      </div>
      <p className="font-display text-3xl">{value}</p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">{sub}</p>
    </Card>
  )
}
