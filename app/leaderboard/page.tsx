import { Trophy, Medal } from "lucide-react"
import { getLeaderboard } from "@/app/actions/analytics"
import { getCurrentPlayer } from "@/app/actions/players"
import { SiteHeader } from "@/components/site-header"
import { Card } from "@/components/ui"
import { formatMoney, moneyClass, playerLabel } from "@/lib/util"

export const revalidate = 0

export default async function LeaderboardPage() {
  const [rows, currentPlayer] = await Promise.all([getLeaderboard(), getCurrentPlayer()])

  return (
    <div className="min-h-dvh">
      <SiteHeader player={currentPlayer} />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center gap-2">
          <Trophy className="h-7 w-7 text-[var(--color-gold)]" />
          <h1 className="font-display text-4xl">Leaderboard</h1>
        </div>
        <p className="mb-6 text-[var(--color-muted)]">
          Season money list across every completed round. Anyone with this link can follow along live.
        </p>

        {rows.length === 0 ? (
          <Card className="p-8 text-center text-[var(--color-muted)]">No completed rounds yet. Play one to get on the board.</Card>
        ) : (
          <div className="grid gap-2">
            {rows.map((r, i) => (
              <Card
                key={r.id}
                className={`flex items-center gap-4 p-4 ${i === 0 ? "border-[var(--color-gold)]" : ""}`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-lg ${
                    i === 0
                      ? "bg-[var(--color-gold)] text-[#2a1e00]"
                      : i === 1
                        ? "bg-[var(--color-surface-2)] text-[var(--color-foreground)]"
                        : i === 2
                          ? "bg-[var(--color-surface-2)] text-[var(--color-gold)]"
                          : "bg-[var(--color-surface-2)] text-[var(--color-muted)]"
                  }`}
                >
                  {i < 3 ? <Medal className="h-4 w-4" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{playerLabel(r)}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {r.roundsPlayed} {r.roundsPlayed === 1 ? "round" : "rounds"} · best round {formatMoney(r.bestRound)}
                  </p>
                </div>
                <span className={`font-display text-2xl ${moneyClass(r.totalMoney)}`}>{formatMoney(r.totalMoney)}</span>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
