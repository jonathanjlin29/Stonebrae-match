import Link from "next/link"
import { PlusCircle, Trophy, BarChart3, Flag, CheckCircle2, Clock } from "lucide-react"
import type { Player } from "@/lib/types"
import { Card, LinkButton } from "./ui"

type RoundRow = { id: number; names: string; status: string; playerCount?: number; createdAt: string; completedAt?: string | null }

export function Dashboard({
  player,
  activeRounds,
  recentRounds,
}: {
  player: Player
  activeRounds: RoundRow[]
  recentRounds: RoundRow[]
}) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <section className="mb-8">
        <p className="text-sm font-medium text-[var(--color-muted)]">Welcome back</p>
        <h1 className="font-display text-4xl leading-tight tracking-tight sm:text-5xl">{player.name}</h1>
      </section>

      <div className="mb-10 grid gap-3 sm:grid-cols-3">
        <LinkButton href="/new" size="lg" className="justify-center sm:justify-start">
          <PlusCircle className="h-5 w-5" /> New Match
        </LinkButton>
        <LinkButton href="/leaderboard" variant="gold" size="lg" className="justify-center sm:justify-start">
          <Trophy className="h-5 w-5" /> Leaderboard
        </LinkButton>
        <LinkButton href={`/player/${player.id}`} variant="outline" size="lg" className="justify-center sm:justify-start">
          <BarChart3 className="h-5 w-5" /> My Stats
        </LinkButton>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 px-1 font-display text-xl tracking-tight">
          <Flag className="h-4.5 w-4.5 text-[var(--color-primary)]" /> In Progress
        </h2>
        {activeRounds.length === 0 ? (
          <Card className="p-8 text-center text-sm text-[var(--color-muted)]">
            No live matches. Start one and the whole group can follow along.
          </Card>
        ) : (
          <Card className="ios-list overflow-hidden p-0">
            {activeRounds.map((r) => (
              <Link
                key={r.id}
                href={`/round/${r.id}`}
                className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-[var(--color-surface-2)] sm:px-5"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.names}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {r.playerCount} players · started {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-primary)]/15 px-3 py-1.5 text-xs font-bold text-[var(--color-primary)]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-primary)]" /> LIVE
                </span>
              </Link>
            ))}
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 px-1 font-display text-xl tracking-tight">
          <CheckCircle2 className="h-4.5 w-4.5 text-[var(--color-gold)]" /> Recent Results
        </h2>
        {recentRounds.length === 0 ? (
          <Card className="p-8 text-center text-sm text-[var(--color-muted)]">No completed matches yet.</Card>
        ) : (
          <Card className="ios-list overflow-hidden p-0">
            {recentRounds.map((r) => (
              <Link
                key={r.id}
                href={`/round/${r.id}`}
                className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-[var(--color-surface-2)] sm:px-5"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.names}</p>
                  <p className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
                    <Clock className="h-3 w-3" />
                    {r.completedAt ? new Date(r.completedAt).toLocaleDateString() : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[var(--color-surface-2)] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
                  Final
                </span>
              </Link>
            ))}
          </Card>
        )}
      </section>
    </div>
  )
}
