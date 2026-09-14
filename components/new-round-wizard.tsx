"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { Check, Plus, Minus, Users, User, ArrowRight, ArrowLeft, X } from "lucide-react"
import { createPlayerOffline } from "@/lib/offline-actions"
import { createRound } from "@/app/actions/rounds"
import type { Player } from "@/lib/types"
import { playerLabel, shortLabel } from "@/lib/util"
import { Button, Card, PlayerAvatar, SegmentedControl } from "./ui"

type MatchDraft = {
  type: "singles" | "team"
  teamA: number[]
  teamB: number[]
  nineBet: number
  overallBet: number
}

export function NewRoundWizard({ players, currentPlayer }: { players: Player[]; currentPlayer: Player }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [step, setStep] = useState(1)
  const [addedPlayers, setAddedPlayers] = useState<Player[]>([])
  const roster = useMemo(() => [...players, ...addedPlayers.filter((added) => !players.some((player) => player.id === added.id))], [players, addedPlayers])
  const [selected, setSelected] = useState<number[]>([currentPlayer.id])
  const [handicaps, setHandicaps] = useState<Record<number, number>>({ [currentPlayer.id]: currentPlayer.handicap })
  const [matches, setMatches] = useState<MatchDraft[]>([])
  const [error, setError] = useState<string | null>(null)

  // add-new-player inline
  const [newName, setNewName] = useState("")
  const [newLast, setNewLast] = useState("")
  const [newUsername, setNewUsername] = useState("")
  const [newPhoto, setNewPhoto] = useState<File | null>(null)
  const [addErr, setAddErr] = useState<string | null>(null)

  const selectedPlayers = useMemo(
    () => selected.map((id) => roster.find((p) => p.id === id)!).filter(Boolean),
    [selected, roster],
  )

  function toggle(id: number, hcp: number) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      setHandicaps((h) => ({ ...h, [id]: h[id] ?? hcp }))
      return [...prev, id]
    })
  }

  function addNewPlayer(e: React.FormEvent) {
    e.preventDefault()
    setAddErr(null)
    start(async () => {
      const res = await createPlayerOffline({ name: newName, lastName: newLast || undefined, nickname: newUsername, photo: newPhoto, handicap: 0 })
      if (!res.ok) {
        setAddErr(res.error)
        return
      }
      setAddedPlayers((current) => [...current, res.player])
      setSelected((s) => [...s, res.player.id])
      setHandicaps((h) => ({ ...h, [res.player.id]: 0 }))
      setNewName("")
      setNewLast("")
      setNewUsername("")
      setNewPhoto(null)
    })
  }

  function autoMatch() {
    // Sensible default matches based on the selected group.
    if (selectedPlayers.length === 2) {
      setMatches([{ type: "singles", teamA: [selected[0]], teamB: [selected[1]], nineBet: 10, overallBet: 10 }])
    } else if (selectedPlayers.length === 4) {
      setMatches([
        { type: "team", teamA: [selected[0], selected[1]], teamB: [selected[2], selected[3]], nineBet: 20, overallBet: 20 },
      ])
    } else {
      setMatches([])
    }
  }

  function goToMatches() {
    if (selected.length < 2) {
      setError("Pick at least two players.")
      return
    }
    setError(null)
    if (matches.length === 0) autoMatch()
    setStep(2)
  }

  function addMatch() {
    setMatches((m) => [
      ...m,
      { type: "singles", teamA: [selected[0]], teamB: [selected[1]], nineBet: 10, overallBet: 10 },
    ])
  }

  function updateMatch(i: number, patch: Partial<MatchDraft>) {
    setMatches((m) => m.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))
  }

  function setSide(i: number, side: "teamA" | "teamB", ids: number[]) {
    setMatches((m) => m.map((x, idx) => (idx === i ? { ...x, [side]: ids } : x)))
  }

  function start_() {
    setError(null)
    if (matches.length === 0) {
      setError("Add at least one match.")
      return
    }
    for (const m of matches) {
      if (m.teamA.length === 0 || m.teamB.length === 0) {
        setError("Every match needs players on both sides.")
        return
      }
      if (m.teamA.some((id) => m.teamB.includes(id))) {
        setError("A player can't be on both teams of the same match.")
        return
      }
    }
    start(async () => {
      const res = await createRound({ playerIds: selected, handicaps, matches })
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.push(`/round/${res.roundId}`)
    })
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-7 flex items-center gap-2">
        <StepDot n={1} active={step === 1} done={step > 1} label="Players" />
        <div className="h-px flex-1 bg-[var(--color-border)]" />
        <StepDot n={2} active={step === 2} done={false} label="Matches" />
      </div>

      {step === 1 && (
        <div>
          <h1 className="mb-1 font-display text-3xl tracking-tight sm:text-4xl">Who&apos;s in the group?</h1>
          <p className="mb-6 text-sm text-[var(--color-muted)]">
            Select existing players or add someone new. Set handicaps.
          </p>

          <Card className="ios-list mb-5 overflow-hidden p-0">
            {roster.map((p) => {
              const on = selected.includes(p.id)
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 p-3.5 transition-colors sm:px-5 ${on ? "bg-[var(--color-primary)]/[0.06]" : ""}`}
                >
                  <button
                    onClick={() => toggle(p.id, p.handicap)}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors ${
                      on
                        ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                        : "bg-[var(--color-surface-2)] text-transparent"
                    }`}
                    aria-label={on ? `Remove ${p.name}` : `Add ${p.name}`}
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </button>
                  <PlayerAvatar player={p} />
                  <span className="flex-1 truncate font-medium">{playerLabel(p)}</span>
                  {on && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-muted)]">
                      <span>HCP</span>
                      <HandicapStepper
                        value={handicaps[p.id] ?? 0}
                        onChange={(v) => setHandicaps((h) => ({ ...h, [p.id]: v }))}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </Card>

          <Card className="mb-5 p-4 sm:p-5">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Plus className="h-4 w-4 text-[var(--color-primary)]" /> Add a new player
            </p>
            <form onSubmit={addNewPlayer} className="flex flex-wrap gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="First name"
                className="h-11 min-w-32 flex-1 rounded-full bg-[var(--color-surface-2)] px-4 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                required
              />
              <input
                value={newLast}
                onChange={(e) => setNewLast(e.target.value)}
                placeholder="Last (if name taken)"
                className="h-11 min-w-32 flex-1 rounded-full bg-[var(--color-surface-2)] px-4 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
              <input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Username (optional)"
                maxLength={20}
                className="h-11 min-w-32 flex-1 rounded-full bg-[var(--color-surface-2)] px-4 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
              <label className="flex h-11 cursor-pointer items-center rounded-full bg-[var(--color-surface-2)] px-4 text-sm text-[var(--color-muted)]">
                Selfie
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setNewPhoto(e.target.files?.[0] ?? null)} className="sr-only" />
              </label>
              <Button type="submit" variant="outline" disabled={pending}>
                Add
              </Button>
            </form>
            {addErr && <p className="mt-2 text-sm text-[var(--color-danger)]">{addErr}</p>}
          </Card>

          {error && <p className="mb-3 text-sm text-[var(--color-danger)]">{error}</p>}
          <Button size="lg" className="w-full" onClick={goToMatches}>
            Next: set up matches <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h1 className="mb-1 font-display text-3xl tracking-tight sm:text-4xl">Set the matches</h1>
          <p className="mb-6 text-sm text-[var(--color-muted)]">
            Each match is a Nassau: front 9, back 9, and overall — plus any presses during the round.
          </p>

          <div className="grid gap-4">
            {matches.map((m, i) => (
              <Card key={i} className="p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <SegmentedControl
                    value={m.type}
                    onChange={(v) => updateMatch(i, { type: v })}
                    options={[
                      { value: "singles", label: "Singles" },
                      { value: "team", label: "Team" },
                    ]}
                  />
                  <button
                    onClick={() => setMatches((ms) => ms.filter((_, idx) => idx !== i))}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)]"
                    aria-label="Remove match"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                  <TeamPicker
                    label="Team A"
                    players={selectedPlayers}
                    value={m.teamA}
                    single={m.type === "singles"}
                    disabledIds={m.teamB}
                    onChange={(ids) => setSide(i, "teamA", ids)}
                  />
                  <span className="text-center font-display text-xl text-[var(--color-muted)]">vs</span>
                  <TeamPicker
                    label="Team B"
                    players={selectedPlayers}
                    value={m.teamB}
                    single={m.type === "singles"}
                    disabledIds={m.teamA}
                    onChange={(ids) => setSide(i, "teamB", ids)}
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-[var(--color-surface-2)] p-3">
                    <p className="mb-1.5 text-xs font-semibold text-[var(--color-muted)]">Bet per nine</p>
                    <div className="flex items-center gap-1.5">
                      <span className="font-display text-lg text-[var(--color-gold)]">$</span>
                      <input
                        type="number"
                        min={0}
                        value={m.nineBet}
                        onChange={(e) => {
                      const raw = e.target.value.replace(/^0+(?=\d)/, "")
                      updateMatch(i, { nineBet: raw === "" ? 0 : Number(raw) })
                    }}
                        className="h-9 w-full min-w-0 rounded-full bg-[var(--color-surface)] px-3 text-center font-display text-lg tabular outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--color-muted)]">× front / back</p>
                  </div>
                  <div className="rounded-2xl bg-[var(--color-surface-2)] p-3">
                    <p className="mb-1.5 text-xs font-semibold text-[var(--color-muted)]">Bet overall</p>
                    <div className="flex items-center gap-1.5">
                      <span className="font-display text-lg text-[var(--color-gold)]">$</span>
                      <input
                        type="number"
                        min={0}
                        value={m.overallBet}
                        onChange={(e) => {
                      const raw = e.target.value.replace(/^0+(?=\d)/, "")
                      updateMatch(i, { overallBet: raw === "" ? 0 : Number(raw) })
                    }}
                        className="h-9 w-full min-w-0 rounded-full bg-[var(--color-surface)] px-3 text-center font-display text-lg tabular outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Button variant="outline" className="mt-4 w-full" onClick={addMatch}>
            <Plus className="h-4 w-4" /> Add another match
          </Button>

          {error && <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p>}

          <div className="mt-5 flex gap-2">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button size="lg" className="flex-1" onClick={start_} disabled={pending}>
              {pending ? "Starting…" : "Start the round"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function StepDot({ n, active, done, label }: { n: number; active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full font-display text-lg ${
          active || done
            ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
            : "bg-[var(--color-surface-2)] text-[var(--color-muted)]"
        }`}
      >
        {done ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
      </span>
      <span className={`text-sm font-medium ${active ? "text-[var(--color-foreground)]" : "text-[var(--color-muted)]"}`}>
        {label}
      </span>
    </div>
  )
}

function HandicapStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const min = 0
  const max = 54
  return (
    <div className="flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-background)] p-0.5">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Decrease handicap"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-7 text-center font-display text-base tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Increase handicap"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function TeamPicker({
  label,
  players,
  value,
  single,
  disabledIds,
  onChange,
}: {
  label: string
  players: Player[]
  value: number[]
  single: boolean
  disabledIds: number[]
  onChange: (ids: number[]) => void
}) {
  function toggle(id: number) {
    if (single) {
      onChange([id])
      return
    }
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  }
  return (
    <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
      <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {players.map((p) => {
          const on = value.includes(p.id)
          const disabled = disabledIds.includes(p.id)
          return (
            <button
              key={p.id}
              disabled={disabled}
              onClick={() => toggle(p.id)}
              className={`rounded-full px-2.5 py-1 text-sm font-medium transition-colors ${
                on
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                  : disabled
                    ? "cursor-not-allowed border border-[var(--color-border)] text-[var(--color-border)]"
                    : "border border-[var(--color-border)] text-[var(--color-foreground)] hover:border-[var(--color-primary)]"
              }`}
            >
              {shortLabel(p)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
