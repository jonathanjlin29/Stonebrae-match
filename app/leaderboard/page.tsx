import { Trophy, Medal } from "lucide-react"
import { getLeaderboard } from "@/app/actions/analytics"
import { getCurrentPlayer } from "@/app/actions/players"
import { SiteHeader } from "@/components/site-header"
import { Card, PlayerAvatar } from "@/components/ui"
import { formatMoney, moneyClass, playerLabel } from "@/lib/util"

export const revalidate = 0

export default async function LeaderboardPage() {
  const [rows, currentPlayer] = await Promise.all([getLeaderboard(), getCurrentPlayer()])

  return (
    <div className="min-h-dvh">
      <SiteHeader player={currentPlayer} />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-1.5 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-gold)]/15">
            <Trophy className="h-5 w-5 text-[var(--color-gold)]" />
          </span>
          <h1 className="font-display text-3xl tracking-tight sm:text-4xl">Leaderboard</h1>
        </div>
        <p className="mb-7 pl-[46px] text-sm text-[var(--color-muted)]">
          Season money list across every completed round. Anyone with this link can follow along live.
        </p>

        {rows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-[var(--color-muted)]">
            No completed rounds yet. Play one to get on the board.
          </Card>
        ) : (
          <Card className="ios-list overflow-hidden p-0">
            {rows.map((r, i) => (
              <div key={r.id} className="flex items-center gap-4 p-4 sm:px-5">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-base tabular ${
                    i === 0
                      ? "bg-[var(--color-gold)] text-[#2a1e00] shadow-[0_6px_16px_-4px_hsl(45_90%_50%/0.55)]"
                      : i === 1
                        ? "bg-[var(--color-surface-2)] text-[var(--color-foreground)]"
                        : i === 2
                          ? "bg-[var(--color-surface-2)] text-[var(--color-gold)]"
                          : "bg-[var(--color-surface-2)] text-[var(--color-muted)]"
                  }`}
                >
                  {i < 3 ? <Medal className="h-4.5 w-4.5" /> : i + 1}
                </span>
                <PlayerAvatar player={r} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{playerLabel(r)}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {r.roundsPlayed} {r.roundsPlayed === 1 ? "round" : "rounds"} · best round {formatMoney(r.bestRound)}
                  </p>
                </div>
                <span className={`shrink-0 font-display text-xl tabular tracking-tight ${moneyClass(r.totalMoney)}`}>
                  {formatMoney(r.totalMoney)}
                </span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}
