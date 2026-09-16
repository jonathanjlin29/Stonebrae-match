"use client"

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Flag, Flame, TrendingUp, Swords, CheckCircle2, Lock, RefreshCw, Trash2, Copy, Link2, ArrowRight, HandCoins, ChevronDown } from "lucide-react"
import { deleteRound } from "@/app/actions/rounds"
import { saveScoreOffline, addPressOffline, completeRoundOffline, updatePressAmountOffline } from "@/lib/offline-actions"
import { cachePage } from "@/lib/offline-store"
import { updateMatchBetsAdmin } from "@/app/actions/admin"
import {
  computeMatchMoney,
  computeMatchStatus,
  computeSegmentStatus,
  getMatchStatusLabel,
  isBounceBack,
  birdieStreakEndingAt,
  relToPar,
  getStrokesGiven,
} from "@/lib/nassau"
import { computeSettlement } from "@/lib/settlement"
import { COURSE } from "@/lib/course"
import type { Match, Press, Round, Scores } from "@/lib/types"
import { formatMoney, moneyClass, shortLabel } from "@/lib/util"
import { Button, Card, Badge, PlayerAvatar, SegmentedControl } from "./ui"

type Celebration = { type: "bounce" | "fire" | "birdie"; name: string; detail: string; key: number }
type Tab = "matches" | "scorecard" | "money"

export function RoundScorecard({
  round,
  currentPlayerId,
  isAdmin = false,
  isPublicView = false,
}: {
  round: Round
  currentPlayerId: number | null
  isAdmin?: boolean
  isPublicView?: boolean
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [scores, setScores] = useState<Scores>(() => clone(round.scores))
  const [matches, setMatches] = useState<Match[]>(() => round.matches)
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [completing, setCompleting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<Tab>("scorecard")
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // Cells the user has typed into but that haven't been confirmed saved yet. A refetch that lands
  // mid-edit must not clobber these, or the score the user just typed appears to "delete itself."
  const dirtyRef = useRef<Set<string>>(new Set())

  const players = round.players.map((p) => ({
    id: p.id,
    name: p.name,
    lastName: p.lastName,
    nickname: p.nickname,
    photoUrl: p.photoUrl,
    handicap: p.roundHandicap,
  }))
  const lowestHandicap = players.length > 0 ? Math.min(...players.map((p) => p.handicap)) : 0
  const isActive = round.status === "active"
  const canEditScores = !isPublicView && (isActive || isAdmin)

  // Keep local state in sync whenever the server component re-fetches (poll or manual refresh),
  // but preserve any cell that's still being edited/saved so in-flight input isn't overwritten.
  useEffect(() => {
    setScores((prev) => mergeScores(round.scores, prev, dirtyRef.current))
    setMatches(round.matches)
  }, [round])

  // Keep a local copy of the round so an offline direct visit to this page (or the shared public
  // link) can still render the last known scores instead of an empty shell.
  useEffect(() => {
    void cachePage(`round:${round.id}`, round)
  }, [round])

  // Everyone viewing an active round gets a periodic re-sync so scores/presses/money stay current
  // without needing push infrastructure.
  useEffect(() => {
    if (!isActive) return
    const interval = setInterval(() => {
      router.refresh()
    }, 30 * 1000)
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
    // The birdie video runs a bit longer than the badge-style pop-ups; onEnded on the <video>
    // will also clear it early once playback finishes, so this timeout is just a safety fallback.
    const duration = c.type === "birdie" ? 4500 : 2400
    celebrationTimer.current = setTimeout(() => setCelebration(null), duration)
  }

  function dismissCelebration() {
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current)
    setCelebration(null)
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
          } else if (
            player &&
            currentPlayerId != null &&
            playerId === currentPlayerId &&
            relToPar(value, COURSE.holes[hole].par) === "birdie"
          ) {
            fireCelebration({ type: "birdie", name: shortLabel(player), detail: "Birdie!" })
          }
        }
      }
      return next
    })
  }

  function commitScore(playerId: number, hole: number) {
    const value = scores[playerId]?.[hole] ?? null
    // Deliberately don't clear dirtyRef here: a background refresh in flight when this save
    // started can still land afterward carrying pre-save data. The sync effect below is the
    // sole authority for clearing a cell's dirty flag, and only does so once the server value
    // it received actually agrees with what's on screen — so a stale refresh can never wipe out
    // a value that hasn't been confirmed saved yet.
    start(async () => {
      await saveScoreOffline(round.id, playerId, hole, value)
    })
  }

  function pressScope(match: Match, scope: "front" | "back" | "overall", amount: number) {
    const [start_, end] = scope === "front" ? [0, 8] : scope === "back" ? [9, 17] : [0, 17]
    const status = computeSegmentStatus(match, scores, players, start_, end)
    if (status.holes.length === 0 || status.frozen || status.holes.length === end - start_ + 1) return
    if (status.finalStatusA === 0) return
    const initiatedBy = status.finalStatusA > 0 ? "B" : "A"
    const startHole = start_ + status.holes.length
    start(async () => {
      const res = await addPressOffline(round.id, match.id, scope, startHole, initiatedBy, amount)
      if (res.ok) {
        setMatches((prev) =>
          prev.map((m) =>
            m.id === match.id
              ? {
                  ...m,
                  presses: [...m.presses, { id: `local-${Date.now()}`, matchId: match.id, scope, startHole, initiatedBy, amount }],
                }
              : m,
          ),
        )
      }
    })
  }

  function finish() {
    setCompleting(true)
    start(async () => {
      await completeRoundOffline(round.id)
      router.push("/")
      router.refresh()
    })
  }

  function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    start(async () => {
      const res = await deleteRound(round.id)
      if (res.ok) {
        router.push("/")
        router.refresh()
      } else {
        setDeleting(false)
        setConfirmingDelete(false)
        setDeleteError(res.error)
      }
    })
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <CelebrationOverlay celebration={celebration} onDismiss={dismissCelebration} />

      <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl tracking-tight sm:text-4xl">Match Scorecard</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={manualRefresh}
            aria-label="Refresh scorecard"
            title="Refresh scorecard"
            className="rounded-full p-2 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          {!isPublicView && (isActive ? (
            <Button
              onClick={finish}
              disabled={completing}
              variant="gold"
              className="h-8 px-2.5 text-xs"
              aria-label={completing ? "Finishing round" : "Complete round"}
              title={completing ? "Finishing…" : "Complete round"}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Badge className="gap-1.5 bg-[var(--color-gold)]/15 text-[var(--color-gold)]">
              <Lock className="h-3.5 w-3.5" /> Final
            </Badge>
          ))}
          {!isPublicView && (isAdmin || (currentPlayerId != null && currentPlayerId === round.createdBy)) &&
            (confirmingDelete ? (
              <div className="flex items-center gap-1.5">
                <Button onClick={handleDelete} disabled={deleting} variant="danger">
                  <Trash2 className="h-4 w-4" /> {deleting ? "Deleting…" : "Confirm Delete"}
                </Button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                  className="rounded-full px-3 py-2 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                aria-label="Delete round"
                title="Delete round"
                className="rounded-full p-2 text-[var(--color-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ))}
        </div>
      </div>

      {!isPublicView && <SharePanel roundId={round.id} />}

      {deleteError ? (
        <div className="mb-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-2.5 text-sm text-[var(--color-danger)]">
          {deleteError}
        </div>
      ) : null}

      <div className="mb-6">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: "scorecard", label: "Scorecard" },
            { value: "matches", label: "Matches" },
            { value: "money", label: "Money" },
          ]}
        />
      </div>

      <section className={`mb-6 ${tab === "money" ? "" : "hidden"}`}>
        <MoneyTab matches={matches} scores={scores} players={players} totals={totals} />
      </section>

      <section className={`mb-6 grid gap-3 ${tab === "matches" ? "" : "hidden"}`}>
        {matches.map((m) => (
          <MatchCard
            key={m.id}
            roundId={round.id}
            match={m}
            scores={scores}
            players={players}
            isActive={isActive}
            isAdmin={isAdmin}
            currentPlayerId={currentPlayerId}
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
                  <div className="text-[10px] font-semibold text-[var(--color-primary)]">HCP {h.hcp}</div>
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
                        <div className="relative inline-flex items-center justify-center">
                          {getStrokesGiven(p.handicap, lowestHandicap, COURSE.holes[h].hcp) > 0 ? (
                            <span
                              aria-label={`${shortLabel(p)} gets a stroke on hole ${COURSE.holes[h].hole}`}
                              title="Stroke received"
                              className="absolute -right-0.5 -top-0.5 z-10 h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]"
                            />
                          ) : null}
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
                        </div>
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
                  <span className="text-[9px] font-semibold leading-none text-[var(--color-primary)]">HCP {h.hcp}</span>
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
                      <div className="relative inline-flex items-center justify-center">
                        {getStrokesGiven(p.handicap, lowestHandicap, h.hcp) > 0 ? (
                          <span
                            aria-label={`${shortLabel(p)} gets a stroke on hole ${h.hole}`}
                            title="Stroke received"
                            className="absolute -right-0.5 -top-0.5 z-10 h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]"
                          />
                        ) : null}
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

function SharePanel({ roundId }: { roundId: number }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  // Start empty on both server and the client's first (hydrating) render so the markup matches,
  // then fill in the real origin-dependent URL once mounted in the browser.
  const [shareUrl, setShareUrl] = useState("")

  useEffect(() => {
    setShareUrl(`${window.location.origin}/share/${roundId}`)
  }, [roundId])

  async function copyUrl() {
    await navigator.clipboard.writeText(shareUrl || `${window.location.origin}/share/${roundId}`)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="mb-5 rounded-xl border border-[var(--color-gold)]/25 bg-[var(--color-gold)]/8">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-[var(--color-foreground)]"
      >
        <span className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-[var(--color-gold)]" /> Public score link
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--color-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input readOnly value={shareUrl} aria-label="Public score URL" className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-muted)]" />
            <Button onClick={copyUrl} variant="outline" className="shrink-0"><Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy link"}</Button>
          </div>
          <p className="mt-2 text-xs text-[var(--color-muted)]">Anyone with this link can view live scores and matches without signing in.</p>
        </div>
      )}
    </div>
  )
}

function MatchCard({
  roundId,
  match,
  scores,
  players,
  isActive,
  isAdmin,
  currentPlayerId,
  onPress,
  onBetsChanged,
}: {
  roundId: number
  match: Match
  scores: Scores
  players: { id: number; name: string; lastName: string | null; nickname: string | null; handicap: number }[]
  isActive: boolean
  isAdmin: boolean
  currentPlayerId: number | null
  onPress: (match: Match, scope: "front" | "back" | "overall", amount: number) => void
  onBetsChanged: (matchId: number, nineBet: number, overallBet: number) => void
}) {
  const [pressOpen, setPressOpen] = useState(false)
  const [pressChoice, setPressChoice] = useState<"nine" | "overall" | null>(null)
  const [pressAmount, setPressAmount] = useState("")

  const byId = Object.fromEntries(players.map((p) => [p.id, p]))
  const teamAName = match.teamA.map((id) => shortLabel(byId[id])).join(" & ")
  const teamBName = match.teamB.map((id) => shortLabel(byId[id])).join(" & ")
  const teamAPlayers = match.teamA.map((id) => byId[id]).filter(Boolean)
  const teamBPlayers = match.teamB.map((id) => byId[id]).filter(Boolean)

  const front = computeSegmentStatus(match, scores, players, 0, 8)
  const back = computeSegmentStatus(match, scores, players, 9, 17)
  const overall = computeSegmentStatus(match, scores, players, 0, 17)

  const frontLabel = front.holes.length ? (front.frozen ? front.closeoutLabel! : getMatchStatusLabel(front.finalStatusA)) : "Not started"
  const backLabel = back.holes.length ? (back.frozen ? back.closeoutLabel! : getMatchStatusLabel(back.finalStatusA)) : "Not started"
  const overallLabel = overall.holes.length
    ? overall.frozen
      ? overall.closeoutLabel!
      : getMatchStatusLabel(overall.finalStatusA)
    : "Not started"
  const currentTeam = currentPlayerId != null && match.teamB.includes(currentPlayerId) ? "B" : "A"
  const teamSign = currentTeam === "B" ? -1 : 1
  const frontStatus = front.holes.length ? front.finalStatusA * teamSign : 0
  const backStatus = back.holes.length ? back.finalStatusA * teamSign : 0
  const overallStatus = overall.holes.length ? overall.finalStatusA * teamSign : 0
  const statusTone = overallStatus < 0
    ? "border-[var(--color-danger)]/45 bg-[var(--color-danger)]/10"
    : overallStatus > 0
      ? "border-[var(--color-primary)]/45 bg-[var(--color-primary)]/10"
      : "border-[var(--color-match-square)]/45 bg-[var(--color-match-square)]/10"

  const canPressFront = isActive && front.holes.length < 9
  const canPressBack = isActive && back.holes.length < 9 && front.holes.length === 9
  const canPressOverall = isActive && overall.holes.length > 0 && overall.holes.length < 18 && !overall.frozen
  const currentNine: "front" | "back" | null = canPressFront ? "front" : canPressBack ? "back" : null
  const canPressAny = currentNine != null || canPressOverall

  function openPress(choice: "nine" | "overall") {
    setPressChoice(choice)
    setPressAmount(String(choice === "overall" ? match.overallBet : match.nineBet))
  }

  function closePress() {
    setPressOpen(false)
    setPressChoice(null)
    setPressAmount("")
  }

  function confirmPress() {
    if (!pressChoice) return
    const scope = pressChoice === "overall" ? "overall" : currentNine
    if (!scope) return
    const amount = Math.round(Math.max(0, Number(pressAmount) || 0))
    onPress(match, scope, amount)
    closePress()
  }

  return (
    <Card className={`p-4 sm:p-5 transition-colors ${statusTone}`}>
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
      <div className="grid gap-1.5 sm:grid-cols-3">
        <div className="grid gap-1">
          <StatusRow label="Front" value={frontLabel} status={frontStatus} frozen={front.frozen} />
          <HoleTimeline holes={front.holes} teamSign={teamSign} />
        </div>
        <div className="grid gap-1">
          <StatusRow label="Back" value={backLabel} status={backStatus} frozen={back.frozen} />
          <HoleTimeline holes={back.holes} teamSign={teamSign} />
        </div>
        <div className="grid gap-1">
          <StatusRow label="Overall" value={overallLabel} status={overallStatus} frozen={overall.frozen} />
          <HoleTimeline holes={overall.holes} teamSign={teamSign} />
        </div>
      </div>
      {match.presses.length > 0 && (
          <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {match.presses.map((p) => (
            <PressRow
              key={p.id}
              roundId={roundId}
              press={p}
              match={match}
              scores={scores}
              players={players}
              currentPlayerId={currentPlayerId}
            />
          ))}
        </div>
      )}
      {canPressAny && (
        <div className="mt-4 border-t border-[var(--color-border)] pt-4">
          {!pressOpen ? (
            <button
              onClick={() => setPressOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[var(--color-gold)] px-4 py-2.5 text-sm font-bold text-[#2a1e00] shadow-[0_4px_10px_-2px_hsl(45_90%_50%/0.5)] transition-transform active:scale-[0.98] hover:brightness-105"
            >
              <Swords className="h-4 w-4" /> Press
            </button>
          ) : !pressChoice ? (
            <div className="flex flex-wrap items-center gap-2">
              {currentNine && (
                <button
                  onClick={() => openPress("nine")}
                  className="flex-1 rounded-full bg-[var(--color-surface-2)] px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--color-border)]"
                >
                  Press {currentNine === "front" ? "Front" : "Back"} Nine
                </button>
              )}
              {canPressOverall && (
                <button
                  onClick={() => openPress("overall")}
                  className="flex-1 rounded-full bg-[var(--color-surface-2)] px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--color-border)]"
                >
                  Press Overall
                </button>
              )}
              <button
                onClick={closePress}
                className="rounded-full px-4 py-2.5 text-sm font-semibold text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">
                Press {pressChoice === "overall" ? "Overall" : `${currentNine === "front" ? "Front" : "Back"} Nine`} for
              </span>
              <span className="text-[var(--color-muted)]">$</span>
              <input
                type="number"
                autoFocus
                value={pressAmount}
                onChange={(e) => setPressAmount(e.target.value)}
                className="h-9 w-20 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-center font-semibold tabular outline-none focus:border-[var(--color-primary)]"
              />
              <button
                onClick={confirmPress}
                className="rounded-full bg-[var(--color-gold)] px-4 py-2 text-sm font-bold text-[#2a1e00] transition-transform active:scale-95 hover:brightness-105"
              >
                Confirm
              </button>
              <button
                onClick={closePress}
                className="rounded-full px-3 py-2 text-sm font-semibold text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              >
                Cancel
              </button>
            </div>
          )}
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
  const [, start] = useTransition()

  function commit() {
    const n = Math.round(Math.max(0, Number(nineBet) || 0))
    const o = Math.round(Math.max(0, Number(overallBet) || 0))
    setNineBet(String(n))
    setOverallBet(String(o))
    if (n === match.nineBet && o === match.overallBet) return
    start(async () => {
      const res = await updateMatchBetsAdmin(match.id, n, o)
      if (res.ok) onSaved(match.id, n, o)
    })
  }

  return (
    <div className="flex items-center gap-1 text-sm font-semibold tabular">
      <span className="text-[var(--color-muted)]">$</span>
      <input
        type="number"
        value={nineBet}
        onChange={(e) => setNineBet(e.target.value)}
        onBlur={commit}
        className="h-7 w-12 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1 text-center outline-none focus:border-[var(--color-primary)]"
      />
      <span className="text-[var(--color-muted)]">/9 · $</span>
      <input
        type="number"
        value={overallBet}
        onChange={(e) => setOverallBet(e.target.value)}
        onBlur={commit}
        className="h-7 w-12 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1 text-center outline-none focus:border-[var(--color-primary)]"
      />
      <span className="text-[var(--color-muted)]">ovr</span>
    </div>
  )
}

function PressRow({
  roundId,
  press,
  match,
  scores,
  players,
  currentPlayerId,
}: {
  roundId: number
  press: Press
  match: Match
  scores: Scores
  players: { id: number; name: string; lastName: string | null; nickname: string | null; handicap: number }[]
  currentPlayerId: number | null
}) {
  const end = press.scope === "front" ? 8 : 17
  const status = computeSegmentStatus(match, scores, players, press.startHole, end)
  const label = status.holes.length
    ? status.frozen
      ? status.closeoutLabel!
      : getMatchStatusLabel(status.finalStatusA)
    : "Not started"
  const currentTeam = currentPlayerId != null && match.teamB.includes(currentPlayerId) ? "B" : "A"
  const teamSign = currentTeam === "B" ? -1 : 1
  const statusVal = status.holes.length ? status.finalStatusA * teamSign : 0
  const statusTone =
    statusVal < 0
      ? "border-[var(--color-danger)]/45 bg-[var(--color-danger)]/10"
      : statusVal > 0
        ? "border-[var(--color-primary)]/45 bg-[var(--color-primary)]/10"
        : "border-[var(--color-match-square)]/45 bg-[var(--color-match-square)]/10"

  const scopeLabel = press.scope === "overall" ? "Overall" : press.scope === "front" ? "Front Nine" : "Back Nine"

  return (
    <div className={`rounded-xl border-l-4 px-2.5 py-2 transition-colors ${statusTone}`}>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold">
        <Swords className="h-3 w-3 shrink-0 text-[var(--color-gold)]" />
        <Badge className="bg-[var(--color-gold)]/15 text-[10px] text-[var(--color-gold)]">Press</Badge>
        <span className="text-[var(--color-muted)]">{scopeLabel} · from hole {press.startHole + 1}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <PressAmountEditor roundId={roundId} matchId={match.id} press={press} />
        </div>
      </div>
      <StatusRow label={scopeLabel} value={label} status={statusVal} frozen={status.frozen} />
      <HoleTimeline holes={status.holes} teamSign={teamSign} className="mt-1.5" />
    </div>
  )
}

function PressAmountEditor({ roundId, matchId, press }: { roundId: number; matchId: number; press: Press }) {
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(String(press.amount))
  const [, start] = useTransition()

  function commit() {
    const value = Math.round(Math.max(0, Number(amount) || 0))
    setAmount(String(value))
    setEditing(false)
    if (value === press.amount) return
    start(async () => {
      await updatePressAmountOffline(roundId, matchId, press.id, value)
    })
  }

  if (editing) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold tabular">
        <span className="text-[var(--color-muted)]">$</span>
        <input
          type="number"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
            if (e.key === "Escape") {
              setAmount(String(press.amount))
              setEditing(false)
            }
          }}
          className="h-6 w-14 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 text-center outline-none focus:border-[var(--color-primary)]"
        />
      </span>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-1 text-[10px] font-semibold text-[var(--color-foreground)]"
    >
      <Badge className="tabular">${press.amount}</Badge>
      <span className="text-[var(--color-primary)] underline underline-offset-2">Edit</span>
    </button>
  )
}

function MoneyTab({
  matches,
  scores,
  players,
  totals,
}: {
  matches: Match[]
  scores: Scores
  players: { id: number; name: string; lastName: string | null; nickname: string | null; handicap: number }[]
  totals: Record<number, number>
}) {
  const byId = Object.fromEntries(players.map((p) => [p.id, p]))
  const sortedPlayers = [...players].sort((a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0))
  const settlement = computeSettlement(totals, players)

  return (
    <div className="grid gap-4">
      <Card className="p-4 sm:p-5">
        <h2 className="mb-3 font-display text-lg tracking-tight">Balances</h2>
        <div className="grid gap-2">
          {sortedPlayers.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-2xl bg-[var(--color-surface-2)] px-4 py-2.5">
              <div className="flex items-center gap-2 font-medium">
                <PlayerAvatar player={p} size="sm" />
                <span>{shortLabel(p)}</span>
              </div>
              <span className={`font-display text-lg tabular ${moneyClass(totals[p.id] ?? 0)}`}>
                {formatMoney(totals[p.id] ?? 0)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg tracking-tight">
          <HandCoins className="h-5 w-5 text-[var(--color-gold)]" /> Settle Up
        </h2>
        {settlement.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">All square — no money owed.</p>
        ) : (
          <div className="grid gap-2">
            {settlement.map((t, i) => (
              <div key={i} className="flex items-center justify-between rounded-2xl bg-[var(--color-surface-2)] px-4 py-2.5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span>{shortLabel(byId[t.from])}</span>
                  <ArrowRight className="h-4 w-4 text-[var(--color-muted)]" />
                  <span>{shortLabel(byId[t.to])}</span>
                </div>
                <span className="font-display text-lg tabular text-[var(--color-primary)]">${t.amount}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="mb-3 font-display text-lg tracking-tight">Match Breakdown</h2>
        <div className="grid gap-3">
          {matches.map((m) => {
            const teamAName = m.teamA.map((id) => shortLabel(byId[id])).join(" & ")
            const teamBName = m.teamB.map((id) => shortLabel(byId[id])).join(" & ")
            const { results } = computeMatchMoney(m, scores, players)
            const segments: { label: string; winner: "A" | "B" | "halved" | null; amount: number }[] = [
              { label: "Front", winner: results.front, amount: m.nineBet },
              { label: "Back", winner: results.back, amount: m.nineBet },
              { label: "Overall", winner: results.overall, amount: m.overallBet },
            ]
            return (
              <div key={m.id} className="rounded-2xl border border-[var(--color-border)] p-3.5">
                <p className="mb-2.5 text-sm font-semibold">
                  {teamAName} <span className="text-[var(--color-muted)]">vs</span> {teamBName}
                </p>
                <div className="grid gap-1.5">
                  {segments.map((s) => (
                    <MoneySegmentRow
                      key={s.label}
                      label={s.label}
                      winner={s.winner}
                      amount={s.amount}
                      winnerName={s.winner === "A" ? teamAName : s.winner === "B" ? teamBName : null}
                    />
                  ))}
                  {m.presses.map((p) => {
                    const scopeLabel = p.scope === "overall" ? "Overall" : p.scope === "front" ? "Front" : "Back"
                    const winner = results.pressResults[p.id]
                    const amount = p.amount ?? (p.scope === "overall" ? m.overallBet : m.nineBet)
                    return (
                      <MoneySegmentRow
                        key={p.id}
                        label={`Press · ${scopeLabel} · hole ${p.startHole + 1}`}
                        winner={winner}
                        amount={amount}
                        winnerName={winner === "A" ? teamAName : winner === "B" ? teamBName : null}
                        indent
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

function MoneySegmentRow({
  label,
  winner,
  amount,
  winnerName,
  indent = false,
}: {
  label: string
  winner: "A" | "B" | "halved" | null
  amount: number
  winnerName: string | null
  indent?: boolean
}) {
  const outcome = winner === null ? "Not settled" : winner === "halved" ? "Halved" : `${winnerName} won`
  return (
    <div className={`flex items-center justify-between text-sm ${indent ? "ml-3 text-[var(--color-muted)]" : ""}`}>
      <span className={indent ? "" : "font-medium"}>{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[var(--color-muted)]">{outcome}</span>
        {winner && winner !== "halved" ? <span className="font-semibold tabular text-[var(--color-primary)]">${amount}</span> : null}
      </div>
    </div>
  )
}

function StatusRow({
  label,
  value,
  status = 0,
  frozen = false,
}: {
  label: string
  value: string
  status?: number
  frozen?: boolean
}) {
  const tone =
    status < 0
      ? "bg-[var(--color-danger)]/10"
      : status > 0
        ? "bg-[var(--color-primary)]/10"
        : "bg-[var(--color-surface-2)]"
  return (
    <div className={`flex items-center justify-between rounded-xl px-3 py-2 transition-colors ${tone}`}>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
        <p className="font-display text-base tracking-tight">{value}</p>
      </div>
      {frozen ? (
        <Badge
          className="gap-1 bg-[var(--color-gold)]/15 text-[10px] text-[var(--color-gold)]"
          title="Match is mathematically decided"
        >
          <Lock className="h-3 w-3" /> Frozen
        </Badge>
      ) : null}
    </div>
  )
}

// Hole-by-hole timeline: one colored box per hole played (from the viewer's perspective) —
// green for a hole won, blue for a halved hole, red for a hole lost. Stops at the freeze point
// since `holes` is already truncated there.
function HoleTimeline({
  holes,
  teamSign,
  className = "",
}: {
  holes: { hole: number; holeWinner: "A" | "B" | "halved" }[]
  teamSign: number
  className?: string
}) {
  if (holes.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {holes.map(({ hole, holeWinner }) => {
        const outcome =
          holeWinner === "halved" ? "push" : (holeWinner === "A" ? 1 : -1) * teamSign > 0 ? "won" : "lost"
        const tone =
          outcome === "won"
            ? "bg-[var(--color-primary)]/20 text-[var(--color-primary)]"
            : outcome === "push"
              ? "bg-[var(--color-match-square)]/25 text-[var(--color-match-square)]"
              : "bg-[var(--color-danger)]/20 text-[var(--color-danger)]"
        return (
          <span
            key={hole}
            title={`Hole ${hole + 1} · ${outcome === "won" ? "Won" : outcome === "push" ? "Halved" : "Lost"}`}
            className={`flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold tabular ${tone}`}
          >
            {hole + 1}
          </span>
        )
      })}
    </div>
  )
}

function CelebrationOverlay({
  celebration,
  onDismiss,
}: {
  celebration: Celebration | null
  onDismiss: () => void
}) {
  if (!celebration) return null

  if (celebration.type === "birdie") {
    return (
      <div
        className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        key={celebration.key}
      >
        <div className="animate-pop flex flex-col items-center gap-3">
          <video
            src="/videos/birdie-bomb.mp4"
            autoPlay
            muted
            playsInline
            onEnded={onDismiss}
            className="h-72 w-72 rounded-[28px] object-cover shadow-2xl ring-1 ring-[var(--color-primary)]/40 sm:h-96 sm:w-96"
          />
          <p className="font-display text-2xl text-white drop-shadow-lg">{celebration.name} · Birdie!</p>
        </div>
      </div>
    )
  }

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
//
// A cell only leaves `dirty` once the server value we just received actually agrees with what's
// on screen. We deliberately don't clear dirty as soon as our own save request resolves: a
// background refresh that started fetching before that save finished can still land afterward
// carrying pre-save data, and trusting "my save promise resolved" timing over "the data I just
// received matches" is what let a stale refresh silently wipe out just-typed scores.
function mergeScores(server: Scores, local: Scores, dirty: Set<string>): Scores {
  const out = clone(server)
  for (const key of dirty) {
    const [pidStr, holeStr] = key.split(":")
    const pid = Number(pidStr)
    const hole = Number(holeStr)
    const localValue = local[pid]?.[hole] ?? null
    const serverValue = out[pid]?.[hole] ?? null
    if (serverValue === localValue) {
      // The server has caught up to what's on screen; safe to stop overriding this cell.
      dirty.delete(key)
      continue
    }
    if (!out[pid]) out[pid] = Array(18).fill(null)
    out[pid][hole] = localValue
  }
  return out
}

function sumRange(holes: (number | null)[], start: number, end: number): number | null {
  const slice = holes.slice(start, end + 1)
  if (!slice.some((v) => v != null)) return null
  return slice.reduce<number>((s, v) => (v != null ? s + v : s), 0)
}
