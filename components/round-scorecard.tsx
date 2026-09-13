"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Flag, Flame, TrendingUp, Swords, CheckCircle2, Lock } from "lucide-react"
import { saveScore, addPress, completeRound } from "@/app/actions/rounds"
import {
  computeMatchMoney,
  computeMatchStatus,
  getMatchStatusLabel,
  isBounceBack,
  birdieStreakEndingAt,
  relToPar,
} from "@/lib/nassau"
import { COURSE } from "@/lib/course"
import type { Match, Round, Scores } from "@/lib/types"
import { formatMoney, moneyClass, shortLabel } from "@/lib/util"
import { Button, Card, Badge } from "./ui"

type Celebration = { type: "bounce" | "fire"; name: string; detail: string; key: number }

export function RoundScorecard({ round, currentPlayerId }: { round: Round; currentPlayerId: number | null }) {
  const router = useRouter()
  const [, start] = useTransition()
  const [scores, setScores] = useState<Scores>(() => clone(round.scores))
  const [matches, setMatches] = useState<Match[]>(() => round.matches)
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [completing, setCompleting] = useState(false)

  const players = round.players.map((p) => ({ id: p.id, name: p.name, lastName: p.lastName, handicap: p.roundHandicap }))
  const isActive = round.status === "active"

  const totals = useMemo(() => {
    const t: Record<number, number> = {}
    for (const p of players) t[p.id] = 0
    for (const m of matches) {
      const { money } = computeMatchMoney(m, scores, players)
      for (const [id, amt] of Object.entries(money)) t[Number(id)] = (t[Number(id)] ?? 0) + amt
    }
    return t
  }, [matches, scores, players])

  function fireCelebration(c: Omit<Celebration, "key">) {
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current)
    setCelebration({ ...c, key: Date.now() })
    celebrationTimer.current = setTimeout(() => setCelebration(null), 2400)
  }

  function updateScore(playerId: number, hole: number, raw: string) {
    const value = raw === "" ? null : Math.max(1, Math.min(15, Number(raw)))
    setScores((prev) => {
      const next = clone(prev)
      if (!next[playerId]) next[playerId] = Array(18).fill(null)
      next[playerId][hole] = value
      if (value != null) {
        const holes = next[playerId]
        const player = players.find((p) => p.id === playerId)
        if (isBounceBack(holes, hole) && player) {
          fireCelebration({ type: "bounce", name: shortLabel(player), detail: "Bounce Back" })
        } else {
          const streak = birdieStreakEndingAt(holes, hole)
          if (streak >= 2 && player) {
            fireCelebration({ type: "fire", name: shortLabel(player), detail: `Fire Hot · ${streak} in a row` })
          }
        }
      }
      return next
    })
  }

  function commitScore(playerId: number, hole: number) {
    const value = scores[playerId]?.[hole] ?? null
    start(async () => {
      await saveScore(round.id, playerId, hole, value)
    })
  }

  function pressScope(match: Match, scope: "front" | "back") {
    const [start_, end] = scope === "front" ? [0, 8] : [9, 17]
    const status = computeMatchStatus(match, scores, players, start_, end)
    if (status.length === 0 || status.length === 9) return
    const last = status[status.length - 1]
    if (last.statusA === 0) return
    const initiatedBy = last.statusA > 0 ? "B" : "A"
    const startHole = start_ + status.length
    start(async () => {
      const res = await addPress(round.id, match.id, scope, startHole, initiatedBy)
      if (res.ok) {
        setMatches((prev) =>
          prev.map((m) =>
            m.id === match.id
              ? { ...m, presses: [...m.presses, { id: `local-${Date.now()}`, matchId: match.id, scope, startHole, initiatedBy }] }
              : m,
          ),
        )
      }
    })
  }

  function finish() {
    setCompleting(true)
    start(async () => {
      await completeRound(round.id)
      router.push(`/round/${round.id}`)
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <CelebrationOverlay celebration={celebration} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--color-muted)]">{round.courseName}</p>
          <h1 className="font-display text-4xl">Match Scorecard</h1>
        </div>
        {isActive ? (
          <Button onClick={finish} disabled={completing} variant="gold">
            <CheckCircle2 className="h-4 w-4" /> {completing ? "Finishing…" : "Complete Round"}
          </Button>
        ) : (
          <Badge className="gap-1.5 border-[var(--color-gold)] text-[var(--color-gold)]">
            <Lock className="h-3.5 w-3.5" /> Final
          </Badge>
        )}
      </div>

      <section className="mb-6 grid gap-3">
        {matches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            scores={scores}
            players={players}
            isActive={isActive}
            onPress={pressScope}
          />
        ))}
      </section>

      <Card className="mb-6 overflow-x-auto p-0">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
              <th className="sticky left-0 z-10 bg-[var(--color-surface)] px-3 py-2 text-left font-medium">Player</th>
              {COURSE.holes.map((h) => (
                <th key={h.hole} className="px-1.5 py-2 text-center font-medium">
                  <div>{h.hole}</div>
                  <div className="text-[10px] opacity-70">Par {h.par}</div>
                </th>
              ))}
              <th className="px-2 py-2 text-center font-semibold text-[var(--color-foreground)]">Tot</th>
              <th className="px-3 py-2 text-center font-semibold">Money</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const holes = scores[p.id] ?? Array(18).fill(null)
              const tot = holes.reduce((s: number, v) => (v != null ? s + v : s), 0)
              const playedAny = holes.some((v: number | null) => v != null)
              return (
                <tr key={p.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="sticky left-0 z-10 bg-[var(--color-surface)] px-3 py-2 font-medium">{shortLabel(p)}</td>
                  {holes.map((v: number | null, h: number) => {
                    const rel = relToPar(v, COURSE.holes[h].par)
                    const relClass =
                      rel === "eagle"
                        ? "text-[var(--color-gold)]"
                        : rel === "birdie"
                          ? "text-[var(--color-primary)]"
                          : rel === "bogey"
                            ? "text-[var(--color-accent)]"
                            : rel === "double+"
                              ? "text-[var(--color-danger)]"
                              : "text-[var(--color-foreground)]"
                    return (
                      <td key={h} className="px-1 py-1.5 text-center">
                        {isActive ? (
                          <input
                            type="number"
                            inputMode="numeric"
                            value={v ?? ""}
                            onChange={(e) => updateScore(p.id, h, e.target.value)}
                            onBlur={() => commitScore(p.id, h)}
                            className={`h-9 w-9 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] text-center outline-none focus:border-[var(--color-primary)] ${relClass}`}
                          />
                        ) : (
                          <span className={`inline-flex h-9 w-9 items-center justify-center font-semibold ${relClass}`}>
                            {v ?? "–"}
                          </span>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-2 py-2 text-center font-display text-lg">{playedAny ? tot : "–"}</td>
                  <td className={`px-3 py-2 text-center font-display text-lg ${moneyClass(totals[p.id] ?? 0)}`}>
                    {formatMoney(totals[p.id] ?? 0)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function MatchCard({
  match,
  scores,
  players,
  isActive,
  onPress,
}: {
  match: Match
  scores: Scores
  players: { id: number; name: string; lastName: string | null; handicap: number }[]
  isActive: boolean
  onPress: (match: Match, scope: "front" | "back") => void
}) {
  const byId = Object.fromEntries(players.map((p) => [p.id, p]))
  const teamAName = match.teamA.map((id) => shortLabel(byId[id])).join(" & ")
  const teamBName = match.teamB.map((id) => shortLabel(byId[id])).join(" & ")

  const front = computeMatchStatus(match, scores, players, 0, 8)
  const back = computeMatchStatus(match, scores, players, 9, 17)
  const overall = computeMatchStatus(match, scores, players, 0, 17)

  const frontLabel = front.length ? getMatchStatusLabel(front[front.length - 1].statusA) : "Not started"
  const backLabel = back.length ? getMatchStatusLabel(back[back.length - 1].statusA) : "Not started"
  const overallLabel = overall.length ? getMatchStatusLabel(overall[overall.length - 1].statusA) : "Not started"

  const canPressFront = isActive && front.length > 0 && front.length < 9 && front[front.length - 1].statusA !== 0
  const canPressBack = isActive && back.length > 0 && back.length < 9 && back[back.length - 1].statusA !== 0

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 font-semibold">
          <Flag className="h-4 w-4 text-[var(--color-primary)]" />
          {teamAName} <span className="text-[var(--color-muted)]">vs</span> {teamBName}
        </p>
        <Badge>
          ${match.nineBet}/9 · ${match.overallBet} ovr
        </Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <StatusRow label="Front" value={frontLabel} canPress={canPressFront} onPress={() => onPress(match, "front")} />
        <StatusRow label="Back" value={backLabel} canPress={canPressBack} onPress={() => onPress(match, "back")} />
        <StatusRow label="Overall" value={overallLabel} canPress={false} onPress={() => {}} />
      </div>
      {match.presses.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {match.presses.map((p) => (
            <Badge key={p.id} className="gap-1 text-[var(--color-gold)]">
              <Swords className="h-3 w-3" /> Press · hole {p.startHole + 1}
            </Badge>
          ))}
        </div>
      )}
    </Card>
  )
}

function StatusRow({
  label,
  value,
  canPress,
  onPress,
}: {
  label: string
  value: string
  canPress: boolean
  onPress: () => void
}) {
  return (
    <div className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
      <div>
        <p className="text-xs text-[var(--color-muted)]">{label}</p>
        <p className="font-display text-lg">{value}</p>
      </div>
      {canPress && (
        <button
          onClick={onPress}
          className="rounded-md bg-[var(--color-gold)] px-2 py-1 text-xs font-semibold text-[#2a1e00] hover:brightness-110"
        >
          Press
        </button>
      )}
    </div>
  )
}

function CelebrationOverlay({ celebration }: { celebration: Celebration | null }) {
  if (!celebration) return null
  const isFire = celebration.type === "fire"
  return (
    <div className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center" key={celebration.key}>
      <div className="relative">
        {isFire &&
          Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className="animate-confetti absolute top-0 h-2 w-2 rounded-sm"
              style={{
                left: `${(i / 14) * 100}%`,
                backgroundColor: i % 3 === 0 ? "var(--color-gold)" : i % 3 === 1 ? "var(--color-primary)" : "var(--color-accent)",
                animationDelay: `${i * 40}ms`,
              }}
            />
          ))}
        <div
          className={`animate-rise flex items-center gap-3 rounded-2xl border px-6 py-4 shadow-2xl backdrop-blur ${
            isFire
              ? "border-[var(--color-danger)] bg-[var(--color-surface)]"
              : "border-[var(--color-primary)] bg-[var(--color-surface)]"
          }`}
        >
          <span className="animate-pop">
            {isFire ? (
              <Flame className="h-8 w-8 animate-flame text-[var(--color-danger)]" />
            ) : (
              <TrendingUp className="h-8 w-8 text-[var(--color-primary)]" />
            )}
          </span>
          <div>
            <p className="font-display text-2xl leading-none">{celebration.name}</p>
            <p className={`text-sm font-semibold ${isFire ? "text-[var(--color-danger)]" : "text-[var(--color-primary)]"}`}>
              {celebration.detail}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function clone(s: Scores): Scores {
  const out: Scores = {}
  for (const [k, v] of Object.entries(s)) out[Number(k)] = [...v]
  return out
}
