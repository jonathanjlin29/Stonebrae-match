"use client"

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Flag, Flame, TrendingUp, Swords, CheckCircle2, Lock, RefreshCw } from "lucide-react"
import { saveScore, addPress, completeRound } from "@/app/actions/rounds"
import { updateMatchBetsAdmin } from "@/app/actions/admin"
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
import { Button, Card, Badge, PlayerAvatar, SegmentedControl } from "./ui"

type Celebration = { type: "bounce" | "fire"; name: string; detail: string; key: number }
type Tab = "matches" | "scorecard"

export function RoundScorecard({
  round,
  currentPlayerId,
  isAdmin = false,
}: {
  round: Round
  currentPlayerId: number | null
  isAdmin?: boolean
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [scores, setScores] = useState<Scores>(() => clone(round.scores))
  const [matches, setMatches] = useState<Match[]>(() => round.matches)
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [completing, setCompleting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<Tab>("matches")
  // Cells the user has typed into but that haven't been confirmed saved yet. A refetch that lands
  // mid-edit must not clobber these, or the score the user just typed appears to "delete itself."
  const dirtyRef = useRef<Set<string>>(new Set())

  const players = round.players.map((p) => ({
    id: p.id,
    name: p.name,
    lastName: p.lastName,
    nickname: p.nickname,
    handicap: p.roundHandicap,
  }))
  const isActive = round.status === "active"
  const canEditScores = isActive || isAdmin

  // Keep local state in sync whenever the server component re-fetches (poll or manual refresh),
  // but preserve any cell that's still being edited/saved so in-flight input isn't overwritten.
  useEffect(() => {
    setScores((prev) => mergeScores(round.scores, prev, dirtyRef.current))
    setMatches(round.matches)
  }, [round])

  // Everyone viewing an active round gets a periodic re-sync so scores/presses/money stay current
  // without needing push infrastructure.
  useEffect(() => {
    if (!isActive) return
    const interval = setInterval(() => {
      router.refresh()
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [isActive, router])

  function manualRefresh() {
    setRefreshing(true)
    router.refresh()
    setTimeout(() => setRefreshing(false), 600)
  }

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
    dirtyRef.current.add(`${playerId}:${hole}`)
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
    const key = `${playerId}:${hole}`
    const value = scores[playerId]?.[hole] ?? null
    start(async () => {
      await saveScore(round.id, playerId, hole, value)
      dirtyRef.current.delete(key)
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
      router.push("/")
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <CelebrationOverlay celebration={celebration} />

      <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--color-muted)]">{round.courseName}</p>
          <h1 className="font-display text-3xl tracking-tight sm:text-4xl">Match Scorecard</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={manualRefresh}
            aria-label="Refresh scorecard"
            title="Refresh scorecard"
            className="rounded-full p-2 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          {isActive ? (
            <Button onClick={finish} disabled={completing} variant="gold">
              <CheckCircle2 className="h-4 w-4" /> {completing ? "Finishing…" : "Complete Round"}
            </Button>
          ) : (
            <Badge className="gap-1.5 bg-[var(--color-gold)]/15 text-[var(--color-gold)]">
              <Lock className="h-3.5 w-3.5" /> Final
            </Badge>
          )}
        </div>
      </div>

      <div className="mb-6">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: "matches", label: "Matches" },
            { value: "scorecard", label: "Scorecard" },
          ]}
        />
      </div>

      <section className={`mb-6 grid gap-3 ${tab === "matches" ? "" : "hidden"}`}>
        {matches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            scores={scores}
            players={players}
            isActive={isActive}
            isAdmin={isAdmin}
            onPress={pressScope}
            onBetsChanged={(matchId, nineBet, overallBet) =>
              setMatches((prev) => prev.map((mm) => (mm.id === matchId ? { ...mm, nineBet, overallBet } : mm)))
            }
          />
        ))}
      </section>

      <Card className={`mb-6 overflow-x-auto p-0 ${tab === "scorecard" ? "hidden sm:block" : "hidden"}`}>
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
              <th className="sticky left-0 z-10 bg-[var(--color-surface)] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                Player
              </th>
              {COURSE.holes.map((h) => (
                <th key={h.hole} className="px-1.5 py-3 text-center font-medium tabular">
                  <div>{h.hole}</div>
                  <div className="text-[10px] opacity-70">Par {h.par}</div>
                </th>
              ))}
              <th className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[var(--color-foreground)]">
                Tot
              </th>
              <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide">Money</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const holes = scores[p.id] ?? Array(18).fill(null)
              const tot = holes.reduce((s: number, v) => (v != null ? s + v : s), 0)
              const playedAny = holes.some((v: number | null) => v != null)
              return (
                <tr key={p.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="sticky left-0 z-10 bg-[var(--color-surface)] px-4 py-2 font-medium">
                    <div className="flex items-center gap-2">
                      <PlayerAvatar player={p} size="sm" />
                      <span>{shortLabel(p)}</span>
                    </div>
                  </td>
                  {holes.map((v: number | null, h: number) => {
                    const rel = relToPar(v, COURSE.holes[h].par)
                    const relClass =
                      rel === "eagle"
                        ? "text-[var(--color-gold)]"
                        : rel === "birdie"
                          ? "text-[var(--color-primary)]"
                          : rel === "bogey"
                            ? "text-[var(--color-muted)]"
                            : rel === "double+"
                              ? "text-[var(--color-danger)]"
                              : "text-[var(--color-foreground)]"
                    return (
                      <td key={h} className="px-1 py-1.5 text-center">
                        {canEditScores ? (
                          <input
                            type="number"
                            inputMode="numeric"
                            value={v ?? ""}
                            onChange={(e) => updateScore(p.id, h, e.target.value)}
                            onBlur={() => commitScore(p.id, h)}
                            className={`h-9 w-9 rounded-full bg-[var(--color-surface-2)] text-center font-semibold tabular outline-none transition-shadow focus:ring-2 focus:ring-[var(--color-primary)] ${relClass}`}
                          />
                        ) : (
                          <span className={`inline-flex h-9 w-9 items-center justify-center font-semibold tabular ${relClass}`}>
                            {v ?? "–"}
                          </span>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-2 py-2 text-center font-display text-lg tabular">{playedAny ? tot : "–"}</td>
                  <td className={`px-3 py-2 text-center font-display text-lg tabular ${moneyClass(totals[p.id] ?? 0)}`}>
                    {formatMoney(totals[p.id] ?? 0)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {/* Mobile: holes stack as rows so players scroll down through the round instead of side to side. */}
      <Card className={`mb-6 overflow-hidden p-0 sm:hidden ${tab === "scorecard" ? "" : "hidden"}`}>
        <div className="max-h-[65vh] overflow-y-auto">
          <div
            className="grid text-sm"
            style={{ gridTemplateColumns: `48px repeat(${players.length}, minmax(0,1fr))` }}
          >
            <div className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Hole
            </div>
            {players.map((p) => (
              <div
                key={p.id}
                className="sticky top-0 z-10 flex flex-col items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-1.5"
              >
                <PlayerAvatar player={p} size="sm" />
                <span className="max-w-full truncate text-[9px] font-semibold">{shortLabel(p)}</span>
              </div>
            ))}

            {COURSE.holes.map((h, hIdx) => (
              <Fragment key={h.hole}>
                <div className="flex flex-col items-center justify-center border-b border-[var(--color-border)] px-1 py-1.5 text-[var(--color-muted)]">
                  <span className="font-display text-sm leading-none text-[var(--color-foreground)]">{h.hole}</span>
                  <span className="text-[9px] leading-none opacity-70">Par {h.par}</span>
                </div>
                {players.map((p) => {
                  const v = scores[p.id]?.[hIdx] ?? null
                  const rel = relToPar(v, h.par)
                  const relClass =
                    rel === "eagle"
                      ? "text-[var(--color-gold)]"
                      : rel === "birdie"
                        ? "text-[var(--color-primary)]"
                        : rel === "bogey"
                          ? "text-[var(--color-muted)]"
                          : rel === "double+"
                            ? "text-[var(--color-danger)]"
                            : "text-[var(--color-foreground)]"
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-center border-b border-[var(--color-border)] px-1 py-1"
                    >
                      {canEditScores ? (
                        <input
                          type="number"
                          inputMode="numeric"
                          value={v ?? ""}
                          onChange={(e) => updateScore(p.id, hIdx, e.target.value)}
                          onBlur={() => commitScore(p.id, hIdx)}
                          className={`h-10 w-10 rounded-full bg-[var(--color-surface-2)] text-center font-semibold tabular outline-none transition-shadow focus:ring-2 focus:ring-[var(--color-primary)] ${relClass}`}
                        />
                      ) : (
                        <span className={`inline-flex h-10 w-10 items-center justify-center font-semibold tabular ${relClass}`}>
                          {v ?? "–"}
                        </span>
                      )}
                    </div>
                  )
                })}

                {hIdx === 8 && (
                  <>
                    <div className="flex items-center justify-center border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/50 px-1 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                      Out
                    </div>
                    {players.map((p) => {
                      const holes = scores[p.id] ?? Array(18).fill(null)
                      const out = sumRange(holes, 0, 8)
                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-center border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/50 px-1 py-1.5 text-sm font-semibold tabular"
                        >
                          {out ?? "–"}
                        </div>
                      )
                    })}
                  </>
                )}

                {hIdx === 17 && (
                  <>
                    <div className="flex items-center justify-center border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/50 px-1 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                      In
                    </div>
                    {players.map((p) => {
                      const holes = scores[p.id] ?? Array(18).fill(null)
                      const inn = sumRange(holes, 9, 17)
                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-center border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/50 px-1 py-1.5 text-sm font-semibold tabular"
                        >
                          {inn ?? "–"}
                        </div>
                      )
                    })}
                  </>
                )}
              </Fragment>
            ))}

            <div className="flex items-center justify-center border-b border-[var(--color-border)] px-1 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Tot
            </div>
            {players.map((p) => {
              const holes = scores[p.id] ?? Array(18).fill(null)
              const tot = holes.reduce((s: number, v) => (v != null ? s + v : s), 0)
              const playedAny = holes.some((v: number | null) => v != null)
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-center border-b border-[var(--color-border)] px-1 py-2 font-display text-base tabular"
                >
                  {playedAny ? tot : "–"}
                </div>
              )
            })}

            <div className="flex items-center justify-center px-1 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              $
            </div>
            {players.map((p) => (
              <div
                key={p.id}
                className={`flex items-center justify-center px-1 py-2 font-display text-base tabular ${moneyClass(totals[p.id] ?? 0)}`}
              >
                {formatMoney(totals[p.id] ?? 0)}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}

function MatchCard({
  match,
  scores,
  players,
  isActive,
  isAdmin,
  onPress,
  onBetsChanged,
}: {
  match: Match
  scores: Scores
  players: { id: number; name: string; lastName: string | null; handicap: number }[]
  isActive: boolean
  isAdmin: boolean
  onPress: (match: Match, scope: "front" | "back") => void
  onBetsChanged: (matchId: number, nineBet: number, overallBet: number) => void
}) {
  const byId = Object.fromEntries(players.map((p) => [p.id, p]))
  const teamAName = match.teamA.map((id) => shortLabel(byId[id])).join(" & ")
  const teamBName = match.teamB.map((id) => shortLabel(byId[id])).join(" & ")
  const teamAPlayers = match.teamA.map((id) => byId[id]).filter(Boolean)
  const teamBPlayers = match.teamB.map((id) => byId[id]).filter(Boolean)

  const front = computeMatchStatus(match, scores, players, 0, 8)
  const back = computeMatchStatus(match, scores, players, 9, 17)
  const overall = computeMatchStatus(match, scores, players, 0, 17)

  const frontLabel = front.length ? getMatchStatusLabel(front[front.length - 1].statusA) : "Not started"
  const backLabel = back.length ? getMatchStatusLabel(back[back.length - 1].statusA) : "Not started"
  const overallLabel = overall.length ? getMatchStatusLabel(overall[overall.length - 1].statusA) : "Not started"

  const canPressFront = isActive && front.length > 0 && front.length < 9 && front[front.length - 1].statusA !== 0
  const canPressBack = isActive && back.length > 0 && back.length < 9 && back[back.length - 1].statusA !== 0

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold">
          <Flag className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
          <div className="flex -space-x-2">
            {teamAPlayers.map((p) => (
              <PlayerAvatar key={p.id} player={p} size="sm" />
            ))}
          </div>
          <span>{teamAName}</span>
          <span className="font-display text-sm text-[var(--color-muted)]">vs</span>
          <span>{teamBName}</span>
          <div className="flex -space-x-2">
            {teamBPlayers.map((p) => (
              <PlayerAvatar key={p.id} player={p} size="sm" />
            ))}
          </div>
        </div>
        {isAdmin ? (
          <BetEditor match={match} onSaved={onBetsChanged} />
        ) : (
          <Badge className="tabular">
            ${match.nineBet}/9 · ${match.overallBet} ovr
          </Badge>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <StatusRow label="Front" value={frontLabel} canPress={canPressFront} onPress={() => onPress(match, "front")} />
        <StatusRow label="Back" value={backLabel} canPress={canPressBack} onPress={() => onPress(match, "back")} />
        <StatusRow label="Overall" value={overallLabel} canPress={false} onPress={() => {}} />
      </div>
      {match.presses.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {match.presses.map((p) => (
            <Badge key={p.id} className="gap-1 bg-[var(--color-gold)]/15 text-[var(--color-gold)]">
              <Swords className="h-3 w-3" /> Press · hole {p.startHole + 1}
            </Badge>
          ))}
        </div>
      )}
    </Card>
  )
}

function BetEditor({
  match,
  onSaved,
}: {
  match: Match
  onSaved: (matchId: number, nineBet: number, overallBet: number) => void
}) {
  const [nineBet, setNineBet] = useState(String(match.nineBet))
  const [overallBet, setOverallBet] = useState(String(match.overallBet))
  const [pending, start] = useTransition()

  function commit() {
    const n = Math.max(0, Number(nineBet) || 0)
    const o = Math.max(0, Number(overallBet) || 0)
    setNineBet(String(n))
    setOverallBet(String(o))
    if (n === match.nineBet && o === match.overallBet) return
    start(async () => {
      const res = await updateMatchBetsAdmin(match.id, n, o)
      if (res.ok) onSaved(match.id, n, o)
    })
  }

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-[var(--color-muted)]">$</span>
      <input
        type="number"
        value={nineBet}
        onChange={(e) => setNineBet(e.target.value)}
        onBlur={commit}
        disabled={pending}
        className="h-7 w-14 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-center font-semibold tabular outline-none focus:border-[var(--color-primary)]"
      />
      <span className="text-[var(--color-muted)]">/9 ·</span>
      <span className="text-[var(--color-muted)]">$</span>
      <input
        type="number"
        value={overallBet}
        onChange={(e) => setOverallBet(e.target.value)}
        onBlur={commit}
        disabled={pending}
        className="h-7 w-14 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-center font-semibold tabular outline-none focus:border-[var(--color-primary)]"
      />
      <span className="text-[var(--color-muted)]">ovr</span>
    </div>
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
    <div className="flex items-center justify-between rounded-2xl bg-[var(--color-surface-2)] px-4 py-2.5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
        <p className="font-display text-lg tracking-tight">{value}</p>
      </div>
      {canPress && (
        <button
          onClick={onPress}
          className="rounded-full bg-[var(--color-gold)] px-3 py-1.5 text-xs font-bold text-[#2a1e00] shadow-[0_4px_10px_-2px_hsl(45_90%_50%/0.5)] transition-transform active:scale-95 hover:brightness-105"
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
                backgroundColor: i % 3 === 0 ? "var(--color-gold)" : i % 3 === 1 ? "var(--color-primary)" : "var(--color-danger)",
                animationDelay: `${i * 40}ms`,
              }}
            />
          ))}
        <div
          className={`glass animate-rise flex items-center gap-3 rounded-[28px] px-6 py-4 shadow-2xl ${
            isFire ? "ring-1 ring-[var(--color-danger)]/40" : "ring-1 ring-[var(--color-primary)]/40"
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

// Start from the freshly-fetched server scores, but keep whatever the user currently has typed
// (or is still saving) for any cell marked dirty, so a refetch mid-edit can't erase live input.
function mergeScores(server: Scores, local: Scores, dirty: Set<string>): Scores {
  const out = clone(server)
  for (const key of dirty) {
    const [pidStr, holeStr] = key.split(":")
    const pid = Number(pidStr)
    const hole = Number(holeStr)
    if (!out[pid]) out[pid] = Array(18).fill(null)
    out[pid][hole] = local[pid]?.[hole] ?? null
  }
  return out
}

function sumRange(holes: (number | null)[], start: number, end: number): number | null {
  const slice = holes.slice(start, end + 1)
  if (!slice.some((v) => v != null)) return null
  return slice.reduce((s, v) => (v != null ? s + v : s), 0)
}
