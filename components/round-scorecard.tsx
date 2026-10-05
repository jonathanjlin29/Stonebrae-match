"use client"

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Flame, TrendingUp, Swords, CheckCircle2, Lock, RefreshCw, Trash2, Copy, Link2, ArrowRight, HandCoins, ChevronDown, Bird, X } from "lucide-react"
import { deleteRound } from "@/app/actions/rounds"
import {
  saveScoreOffline,
  addPressOffline,
  completeRoundOffline,
  updatePressAmountOffline,
  syncOfflineChanges,
} from "@/lib/offline-actions"
import { cachePage, getQueuedMutations, readCachedPage } from "@/lib/offline-store"
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
  type SegmentStatus,
} from "@/lib/nassau"
import { computeSettlement } from "@/lib/settlement"
import { COURSE, type Hole } from "@/lib/course"
import type { Match, Press, Round, Scores } from "@/lib/types"
import { formatMoney, moneyClass, shortLabel } from "@/lib/util"
import { Button, Card, Badge, PlayerAvatar, SegmentedControl } from "./ui"

type Celebration = { type: "bounce" | "fire" | "birdie"; name: string; detail: string; key: number }
type Tab = "matches" | "scorecard" | "money"
type DirtyCell = { value: number | null; at: number }
type PressScope = "front" | "back" | "overall"
const SCOPE_RANGE: Record<PressScope, [number, number]> = { front: [0, 8], back: [9, 17], overall: [0, 17] }

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
  // Local-first edits: every score/press change is saved on this phone first and uploaded in the
  // background. Until the server's copy agrees, these overlay whatever the server sends so a
  // refresh can never wipe out something just entered.
  const dirtyRef = useRef<Map<string, DirtyCell>>(new Map())
  const pendingPressesRef = useRef<Map<string, Press>>(new Map())
  const pendingAmountsRef = useRef<Map<string, number>>(new Map())
  const serverRef = useRef<{ scores: Scores; matches: Match[] }>({ scores: round.scores, matches: round.matches })

  const players = round.players.map((p) => ({
    id: p.id,
    name: p.name,
    lastName: p.lastName,
    nickname: p.nickname,
    photoUrl: p.photoUrl,
    handicap: p.roundHandicap,
  }))
  const courseHoles: Hole[] = round.holes?.length === 18 ? round.holes : COURSE.holes
  const lowestHandicap = players.length > 0 ? Math.min(...players.map((p) => p.handicap)) : 0
  const isActive = round.status === "active"
  const canEditScores = !isPublicView && (isActive || isAdmin)

  const applyOverlay = useCallback(() => {
    setScores(mergeScores(serverRef.current.scores, dirtyRef.current))
    setMatches(mergeMatches(serverRef.current.matches, pendingPressesRef.current, pendingAmountsRef.current))
  }, [])

  useEffect(() => {
    serverRef.current = { scores: round.scores, matches: round.matches }
    applyOverlay()
  }, [round, applyOverlay])

  // Restore edits still waiting to upload (e.g. after reloading the app with no signal). When
  // offline, the snapshot saved on this phone is newer than any cached page, so prefer it.
  useEffect(() => {
    let cancelled = false
    async function restore() {
      if (!navigator.onLine) {
        const snapshot = await readCachedPage<Round>(`round:${round.id}`)
        if (snapshot && !cancelled) serverRef.current = { scores: snapshot.scores, matches: snapshot.matches }
      }
      const queued = await getQueuedMutations()
      if (cancelled) return
      for (const mutation of queued) {
        const p = mutation.payload as Record<string, any>
        if (p?.roundId !== round.id) continue
        if (mutation.action === "saveScore") {
          dirtyRef.current.set(`${p.playerId}:${p.hole}`, { value: p.strokes ?? null, at: mutation.createdAt })
        } else if (mutation.action === "addPress" && p.pressId) {
          pendingPressesRef.current.set(p.pressId, {
            id: p.pressId,
            matchId: p.matchId,
            scope: p.scope,
            startHole: p.startHole,
            initiatedBy: p.initiatedBy,
            amount: p.amount,
          })
        } else if (mutation.action === "updatePressAmount") {
          pendingAmountsRef.current.set(p.pressId, p.amount)
        }
      }
      applyOverlay()
    }
    restore().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [round.id, applyOverlay])

  // Keep the latest on-screen state on the phone so the round still opens with no signal.
  useEffect(() => {
    void cachePage(`round:${round.id}`, { ...round, scores, matches })
  }, [round, scores, matches])

  // Pull fresh data only when it can actually arrive: refreshing with no connection is what used
  // to knock the page over. Also refresh right after queued edits finish uploading.
  useEffect(() => {
    const refreshIfOnline = () => {
      if (navigator.onLine && document.visibilityState === "visible") router.refresh()
    }
    const onSynced = async () => {
      // A cell whose upload finished a while ago but still disagrees was changed by someone
      // else — stop overriding it and let the server's value show.
      const queuedKeys = new Set(
        (await getQueuedMutations())
          .filter((m) => m.action === "saveScore")
          .map((m) => {
            const p = m.payload as { playerId: number; hole: number }
            return `${p.playerId}:${p.hole}`
          }),
      )
      const cutoff = Date.now() - 60 * 1000
      for (const [key, cell] of dirtyRef.current) {
        if (!queuedKeys.has(key) && cell.at < cutoff) dirtyRef.current.delete(key)
      }
      refreshIfOnline()
    }
    window.addEventListener("offline-synced", onSynced)
    const interval = isActive ? setInterval(refreshIfOnline, 30 * 1000) : null
    return () => {
      window.removeEventListener("offline-synced", onSynced)
      if (interval) clearInterval(interval)
    }
  }, [isActive, router])

  function manualRefresh() {
    setRefreshing(true)
    syncOfflineChanges()
      .catch(() => undefined)
      .finally(() => {
        if (navigator.onLine) router.refresh()
        setTimeout(() => setRefreshing(false), 400)
      })
  }

  const totals = useMemo(() => {
    const t: Record<number, number> = {}
    for (const p of players) t[p.id] = 0
    for (const m of matches) {
      const { money } = computeMatchMoney(m, scores, players, courseHoles)
      for (const [id, amt] of Object.entries(money)) t[Number(id)] = (t[Number(id)] ?? 0) + amt
    }
    return t
  }, [matches, scores, players, courseHoles])

  function fireCelebration(c: Omit<Celebration, "key">) {
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current)
    setCelebration({ ...c, key: Date.now() })
    celebrationTimer.current = setTimeout(() => setCelebration(null), 2000)
  }

  function dismissCelebration() {
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current)
    setCelebration(null)
  }

  function updateScore(playerId: number, hole: number, raw: string) {
    if (raw !== "" && !Number.isFinite(Number(raw))) return
    const value = raw === "" ? null : Math.max(1, Math.min(15, Math.round(Number(raw))))
    dirtyRef.current.set(`${playerId}:${hole}`, { value, at: Date.now() })
    const next = clone(scores)
    if (!next[playerId]) next[playerId] = Array(18).fill(null)
    next[playerId][hole] = value
    setScores(next)
    saveScoreOffline(round.id, playerId, hole, value).catch((error) =>
      console.error("[scorecard] Could not save score on this phone", error),
    )

    if (value == null) return
    const holes = next[playerId]
    const player = players.find((p) => p.id === playerId)
    if (!player) return
    if (isBounceBack(holes, hole, courseHoles)) {
      fireCelebration({ type: "bounce", name: shortLabel(player), detail: "Bounce Back" })
      return
    }
    const streak = birdieStreakEndingAt(holes, hole, courseHoles)
    if (streak >= 2) {
      fireCelebration({ type: "fire", name: shortLabel(player), detail: `Fire Hot · ${streak} in a row` })
    } else if (playerId === currentPlayerId && relToPar(value, courseHoles[hole].par) === "birdie") {
      fireCelebration({ type: "birdie", name: shortLabel(player), detail: "Birdie!" })
    }
  }

  function addPress(match: Match, scope: PressScope, startHole: number, amount: number) {
    const [segStart] = SCOPE_RANGE[scope]
    const before = startHole > segStart ? computeMatchStatus(match, scores, players, segStart, startHole - 1, courseHoles) : []
    const statusBefore = before.length ? before[before.length - 1].statusA : 0
    // The side that's down is the one pressing; an all-square back-dated press defaults to A.
    const initiatedBy: "A" | "B" = statusBefore > 0 ? "B" : "A"
    const press: Press = {
      id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      matchId: match.id,
      scope,
      startHole,
      initiatedBy,
      amount,
    }
    pendingPressesRef.current.set(press.id, press)
    applyOverlay()
    addPressOffline(round.id, match.id, press.id, scope, startHole, initiatedBy, amount).catch((error) =>
      console.error("[scorecard] Could not save press on this phone", error),
    )
  }

  function changePressAmount(match: Match, pressId: string, amount: number) {
    const pending = pendingPressesRef.current.get(pressId)
    if (pending) pendingPressesRef.current.set(pressId, { ...pending, amount })
    pendingAmountsRef.current.set(pressId, amount)
    applyOverlay()
    updatePressAmountOffline(round.id, match.id, pressId, amount).catch((error) =>
      console.error("[scorecard] Could not save press amount on this phone", error),
    )
  }

  async function finish() {
    setCompleting(true)
    try {
      await completeRoundOffline(round.id)
    } catch (error) {
      console.error("[scorecard] Could not complete round", error)
    }
    router.push("/")
    if (navigator.onLine) router.refresh()
  }

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await deleteRound(round.id)
      if (res.ok) {
        router.push("/")
        router.refresh()
        return
      }
      setDeleteError(res.error)
    } catch {
      setDeleteError("You need a connection to delete a round. Try again when you have signal.")
    }
    setDeleting(false)
    setConfirmingDelete(false)
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <CelebrationOverlay celebration={celebration} onDismiss={dismissCelebration} />

      <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl tracking-tight sm:text-4xl">Match Scorecard</h1>
          {round.courseName ? (
            <p className="text-sm text-[var(--color-muted)]">{round.courseName}</p>
          ) : null}
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
        <MoneyTab matches={matches} scores={scores} players={players} totals={totals} courseHoles={courseHoles} />
      </section>

      <section className={`mb-6 grid gap-2 sm:grid-cols-2 ${tab === "matches" ? "" : "hidden"}`}>
        {matches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            scores={scores}
            players={players}
            courseHoles={courseHoles}
            canPress={canEditScores}
            isAdmin={isAdmin && !isPublicView}
            currentPlayerId={currentPlayerId}
            onAddPress={addPress}
            onPressAmount={changePressAmount}
            onBetsChanged={(matchId, nineBet, overallBet) => {
              serverRef.current = {
                ...serverRef.current,
                matches: serverRef.current.matches.map((mm) => (mm.id === matchId ? { ...mm, nineBet, overallBet } : mm)),
              }
              applyOverlay()
            }}
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
              {courseHoles.map((h) => (
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
                    const rel = relToPar(v, courseHoles[h].par)
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
                          {getStrokesGiven(p.handicap, lowestHandicap, courseHoles[h].hcp) > 0 ? (
                            <span
                              aria-label={`${shortLabel(p)} gets a stroke on hole ${courseHoles[h].hole}`}
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
                            onBlur={() => void syncOfflineChanges().catch(() => undefined)}
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

            {courseHoles.map((h, hIdx) => (
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
                          onBlur={() => void syncOfflineChanges().catch(() => undefined)}
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

type ScorecardPlayer = { id: number; name: string; lastName: string | null; nickname: string | null; handicap: number }

function statusToneClass(status: number) {
  return status < 0
    ? "border-[var(--color-danger)]/45 bg-[var(--color-danger)]/10"
    : status > 0
      ? "border-[var(--color-primary)]/45 bg-[var(--color-primary)]/10"
      : "border-[var(--color-match-square)]/45 bg-[var(--color-match-square)]/10"
}

function segmentLabel(status: SegmentStatus) {
  if (!status.holes.length) return "–"
  return status.frozen ? status.closeoutLabel! : getMatchStatusLabel(status.finalStatusA)
}

// Consecutive holes from the start of a segment where every player in the match has a score.
function holesPlayedInRange(match: Match, scores: Scores, start: number, end: number) {
  const ids = [...match.teamA, ...match.teamB]
  let count = 0
  for (let h = start; h <= end; h++) {
    if (!ids.every((id) => scores[id]?.[h] != null)) break
    count++
  }
  return count
}

function MatchCard({
  match,
  scores,
  players,
  courseHoles,
  canPress,
  isAdmin,
  currentPlayerId,
  onAddPress,
  onPressAmount,
  onBetsChanged,
}: {
  match: Match
  scores: Scores
  players: ScorecardPlayer[]
  courseHoles: Hole[]
  canPress: boolean
  isAdmin: boolean
  currentPlayerId: number | null
  onAddPress: (match: Match, scope: PressScope, startHole: number, amount: number) => void
  onPressAmount: (match: Match, pressId: string, amount: number) => void
  onBetsChanged: (matchId: number, nineBet: number, overallBet: number) => void
}) {
  const [pressOpen, setPressOpen] = useState(false)

  const byId = Object.fromEntries(players.map((p) => [p.id, p]))
  const teamAName = match.teamA.map((id) => shortLabel(byId[id])).join(" & ")
  const teamBName = match.teamB.map((id) => shortLabel(byId[id])).join(" & ")

  const front = computeSegmentStatus(match, scores, players, 0, 8, courseHoles)
  const back = computeSegmentStatus(match, scores, players, 9, 17, courseHoles)
  const overall = computeSegmentStatus(match, scores, players, 0, 17, courseHoles)
  const allHoles = computeMatchStatus(match, scores, players, 0, 17, courseHoles)

  const teamSign = currentPlayerId != null && match.teamB.includes(currentPlayerId) ? -1 : 1
  const overallStatus = overall.holes.length ? overall.finalStatusA * teamSign : 0

  return (
    <Card className={`flex flex-col gap-2 p-2.5 transition-colors ${statusToneClass(overallStatus)}`}>
      <div className="flex items-center gap-2">
        <p className="flex min-w-0 flex-1 items-baseline gap-1.5 text-sm font-semibold">
          <span className="truncate">{teamAName}</span>
          <span className="shrink-0 text-xs font-normal text-[var(--color-muted)]">vs</span>
          <span className="truncate">{teamBName}</span>
        </p>
        {!isAdmin && (
          <span className="shrink-0 text-[11px] font-semibold tabular text-[var(--color-muted)]">
            ${match.nineBet}/${match.overallBet}
          </span>
        )}
        {canPress && (
          <button
            onClick={() => setPressOpen((v) => !v)}
            aria-expanded={pressOpen}
            className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-[var(--color-gold)] px-2.5 text-xs font-bold text-[#2a1e00] transition-transform active:scale-95"
          >
            {pressOpen ? <X className="h-3.5 w-3.5" /> : <Swords className="h-3.5 w-3.5" />}
            {pressOpen ? "Close" : "Press"}
          </button>
        )}
      </div>

      {isAdmin && <BetEditor match={match} onSaved={onBetsChanged} />}

      <div className="grid grid-cols-3 gap-1.5">
        <SegmentChip label="F" value={segmentLabel(front)} status={front.holes.length ? front.finalStatusA * teamSign : 0} frozen={front.frozen} />
        <SegmentChip label="B" value={segmentLabel(back)} status={back.holes.length ? back.finalStatusA * teamSign : 0} frozen={back.frozen} />
        <SegmentChip label="Ovr" value={segmentLabel(overall)} status={overallStatus} frozen={overall.frozen} />
      </div>

      <HoleStrip holes={allHoles} teamSign={teamSign} />

      {match.presses.length > 0 && (
        <div className="grid grid-cols-3 gap-1">
          {match.presses.map((p, i) => (
            <PressChip
              key={p.id}
              index={i + 1}
              press={p}
              match={match}
              scores={scores}
              players={players}
              courseHoles={courseHoles}
              teamSign={teamSign}
              canEdit={canPress}
              onAmount={(amount) => onPressAmount(match, p.id, amount)}
            />
          ))}
        </div>
      )}

      {pressOpen && (
        <PressForm
          match={match}
          scores={scores}
          onCancel={() => setPressOpen(false)}
          onConfirm={(scope, startHole, amount) => {
            onAddPress(match, scope, startHole, amount)
            setPressOpen(false)
          }}
        />
      )}
    </Card>
  )
}

function SegmentChip({ label, value, status, frozen }: { label: string; value: string; status: number; frozen: boolean }) {
  const tone =
    status < 0
      ? "bg-[var(--color-danger)]/15 text-[var(--color-danger)]"
      : status > 0
        ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
        : "bg-[var(--color-surface-2)] text-[var(--color-foreground)]"
  return (
    <div className={`flex items-center justify-between gap-1 rounded-lg px-2 py-1 ${tone}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{label}</span>
      <span className="flex min-w-0 items-center gap-0.5 truncate font-display text-sm leading-none tabular">
        {frozen && <Lock className="h-2.5 w-2.5 shrink-0 text-[var(--color-gold)]" aria-label="Decided" />}
        {value}
      </span>
    </div>
  )
}

// All 18 holes as a thin strip: green = won, blue = halved, red = lost, grey = not played yet.
function HoleStrip({
  holes,
  teamSign,
}: {
  holes: { hole: number; holeWinner: "A" | "B" | "halved" }[]
  teamSign: number
}) {
  const byHole = new Map(holes.map((h) => [h.hole, h.holeWinner]))
  const cell = (h: number) => {
    const w = byHole.get(h)
    const outcome = w == null ? null : w === "halved" ? "push" : (w === "A" ? 1 : -1) * teamSign > 0 ? "won" : "lost"
    const tone =
      outcome === "won"
        ? "bg-[var(--color-primary)]"
        : outcome === "lost"
          ? "bg-[var(--color-danger)]"
          : outcome === "push"
            ? "bg-[var(--color-match-square)]"
            : "bg-[var(--color-surface-2)]"
    return <span key={h} className={`h-1.5 flex-1 rounded-full ${tone}`} />
  }
  return (
    <div className="flex gap-1.5" aria-hidden>
      <div className="flex flex-1 gap-0.5">{Array.from({ length: 9 }, (_, i) => cell(i))}</div>
      <div className="flex flex-1 gap-0.5">{Array.from({ length: 9 }, (_, i) => cell(i + 9))}</div>
    </div>
  )
}

function PressForm({
  match,
  scores,
  onConfirm,
  onCancel,
}: {
  match: Match
  scores: Scores
  onConfirm: (scope: PressScope, startHole: number, amount: number) => void
  onCancel: () => void
}) {
  const frontPlayed = holesPlayedInRange(match, scores, 0, 8)
  const options = (["front", "back", "overall"] as PressScope[]).map((scope) => {
    const [s, e] = SCOPE_RANGE[scope]
    const played = holesPlayedInRange(match, scores, s, e)
    // Any hole already played can be pressed retroactively, plus the next hole to play.
    const maxStart = Math.min(e, s + played)
    const available = scope !== "back" || frontPlayed === 9 || played > 0
    return { scope, s, maxStart, available }
  })
  const defaultScope: PressScope = frontPlayed === 9 ? "back" : "front"
  const [scope, setScope] = useState<PressScope>(defaultScope)
  const current = options.find((o) => o.scope === scope)!
  const [startHole, setStartHole] = useState(current.maxStart)
  const [amount, setAmount] = useState(String(scope === "overall" ? match.overallBet : match.nineBet))

  function pickScope(next: PressScope) {
    const opt = options.find((o) => o.scope === next)!
    setScope(next)
    setStartHole(opt.maxStart)
    setAmount(String(next === "overall" ? match.overallBet : match.nineBet))
  }

  const holeChoices = Array.from({ length: current.maxStart - current.s + 1 }, (_, i) => current.s + i)

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-2">
      <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Press segment">
        {options.map((o) => (
          <button
            key={o.scope}
            role="radio"
            aria-checked={scope === o.scope}
            disabled={!o.available}
            onClick={() => pickScope(o.scope)}
            className={`h-8 rounded-lg text-xs font-semibold capitalize transition-colors disabled:opacity-35 ${
              scope === o.scope
                ? "bg-[var(--color-gold)] text-[#2a1e00]"
                : "bg-[var(--color-surface-2)] text-[var(--color-foreground)]"
            }`}
          >
            {o.scope}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label className="flex flex-1 items-center gap-1.5 text-xs text-[var(--color-muted)]">
          From hole
          <select
            value={startHole}
            onChange={(e) => setStartHole(Number(e.target.value))}
            className="h-8 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-sm font-semibold text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)]"
          >
            {holeChoices.map((h) => (
              <option key={h} value={h}>
                {h + 1}
                {h === current.maxStart ? " (next)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
          $
          <input
            type="number"
            inputMode="numeric"
            aria-label="Press amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-8 w-14 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1 text-center text-sm font-semibold tabular text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)]"
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onConfirm(scope, startHole, Math.round(Math.max(0, Number(amount) || 0)))}
          className="h-8 flex-1 rounded-full bg-[var(--color-gold)] text-xs font-bold text-[#2a1e00] transition-transform active:scale-95"
        >
          Add press from hole {startHole + 1}
        </button>
        <button onClick={onCancel} className="h-8 rounded-full px-3 text-xs font-semibold text-[var(--color-muted)]">
          Cancel
        </button>
      </div>
    </div>
  )
}

function PressChip({
  index,
  press,
  match,
  scores,
  players,
  courseHoles,
  teamSign,
  canEdit,
  onAmount,
}: {
  index: number
  press: Press
  match: Match
  scores: Scores
  players: ScorecardPlayer[]
  courseHoles: Hole[]
  teamSign: number
  canEdit: boolean
  onAmount: (amount: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(String(press.amount))
  const end = press.scope === "front" ? 8 : 17
  const status = computeSegmentStatus(match, scores, players, press.startHole, end, courseHoles)
  const statusVal = status.holes.length ? status.finalStatusA * teamSign : 0
  const scopeLetter = press.scope === "overall" ? "O" : press.scope === "front" ? "F" : "B"
  const valueTone =
    statusVal < 0 ? "text-[var(--color-danger)]" : statusVal > 0 ? "text-[var(--color-primary)]" : "text-[var(--color-foreground)]"

  function commit() {
    const value = Math.round(Math.max(0, Number(amount) || 0))
    setAmount(String(value))
    setEditing(false)
    if (value !== press.amount) onAmount(value)
  }

  return (
    <div
      className={`flex min-w-0 items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] font-semibold ${statusToneClass(statusVal)}`}
      title={`Press ${index}: ${press.scope} from hole ${press.startHole + 1}`}
    >
      <span className="shrink-0 text-[var(--color-gold)]">
        {scopeLetter}
        {press.startHole + 1}
      </span>
      <span className={`truncate tabular ${valueTone}`}>{segmentLabel(status)}</span>
      {editing ? (
        <input
          type="number"
          inputMode="numeric"
          autoFocus
          aria-label={`Press ${index} amount`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) commit()
            if (e.key === "Escape") {
              setAmount(String(press.amount))
              setEditing(false)
            }
          }}
          className="ml-auto h-5 w-10 shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] text-center tabular outline-none"
        />
      ) : (
        <button
          onClick={() => {
            setAmount(String(press.amount))
            setEditing(true)
          }}
          disabled={!canEdit}
          aria-label={`Edit press ${index} amount, currently $${press.amount}`}
          className="ml-auto shrink-0 tabular text-[var(--color-foreground)] underline-offset-2 enabled:underline"
        >
          ${press.amount}
        </button>
      )}
    </div>
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

function MoneyTab({
  matches,
  scores,
  players,
  totals,
  courseHoles,
}: {
  matches: Match[]
  scores: Scores
  players: { id: number; name: string; lastName: string | null; nickname: string | null; handicap: number }[]
  totals: Record<number, number>
  courseHoles: Hole[]
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
            const { results } = computeMatchMoney(m, scores, players, courseHoles)
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

function CelebrationOverlay({
  celebration,
  onDismiss,
}: {
  celebration: Celebration | null
  onDismiss: () => void
}) {
  if (!celebration) return null

  const isFire = celebration.type === "fire"
  const isBirdie = celebration.type === "birdie"
  const accent = isFire
    ? "var(--color-danger)"
    : isBirdie
      ? "var(--color-gold)"
      : "var(--color-primary)"
  return (
    <div className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center px-4" key={celebration.key}>
      <div
        className="glass animate-rise flex items-center gap-2.5 rounded-2xl px-4 py-2.5 shadow-xl ring-1"
        style={{ ["--tw-ring-color" as string]: `color-mix(in srgb, ${accent} 40%, transparent)` }}
      >
        <span className="animate-pop">
          {isFire ? (
            <Flame className="h-5 w-5 animate-flame text-[var(--color-danger)]" />
          ) : isBirdie ? (
            <Bird className="h-5 w-5 text-[var(--color-gold)]" />
          ) : (
            <TrendingUp className="h-5 w-5 text-[var(--color-primary)]" />
          )}
        </span>
        <div className="leading-tight">
          <p className="font-display text-base leading-none">{celebration.name}</p>
          <p className="text-xs font-semibold" style={{ color: accent }}>
            {celebration.detail}
          </p>
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

// Server scores with every unconfirmed local edit laid on top. A cell stops being overridden
// once the server's value agrees with what was entered on this phone.
function mergeScores(server: Scores, dirty: Map<string, DirtyCell>): Scores {
  const out = clone(server)
  for (const [key, cell] of dirty) {
    const [pid, hole] = key.split(":").map(Number)
    if ((out[pid]?.[hole] ?? null) === cell.value) {
      dirty.delete(key)
      continue
    }
    if (!out[pid]) out[pid] = Array(18).fill(null)
    out[pid][hole] = cell.value
  }
  return out
}

function mergeMatches(server: Match[], pendingPresses: Map<string, Press>, pendingAmounts: Map<string, number>): Match[] {
  return server.map((m) => {
    const serverIds = new Set(m.presses.map((p) => p.id))
    const presses = m.presses.map((p) => {
      const amount = pendingAmounts.get(p.id)
      if (amount == null) return p
      if (amount === p.amount) {
        pendingAmounts.delete(p.id)
        return p
      }
      return { ...p, amount }
    })
    for (const [id, press] of pendingPresses) {
      if (press.matchId !== m.id) continue
      if (serverIds.has(id)) {
        pendingPresses.delete(id)
        continue
      }
      presses.push({ ...press, amount: pendingAmounts.get(id) ?? press.amount })
    }
    return { ...m, presses }
  })
}

function sumRange(holes: (number | null)[], start: number, end: number): number | null {
  const slice = holes.slice(start, end + 1)
  if (!slice.some((v) => v != null)) return null
  return slice.reduce<number>((s, v) => (v != null ? s + v : s), 0)
}
