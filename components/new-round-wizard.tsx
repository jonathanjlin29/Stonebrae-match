"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { Check, Plus, Users, User, ArrowRight, ArrowLeft, X } from "lucide-react"
import { createPlayer } from "@/app/actions/players"
import { createRound } from "@/app/actions/rounds"
import type { Player } from "@/lib/types"
import { initials, playerLabel, shortLabel } from "@/lib/util"
import { Button, Card } from "./ui"

type MatchDraft = {
  type: "singles" | "team"
  teamA: number[]
  teamB: number[]
  bet: number
}

export function NewRoundWizard({ players, currentPlayer }: { players: Player[]; currentPlayer: Player }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [step, setStep] = useState(1)
  const [roster, setRoster] = useState<Player[]>(players)
  const [selected, setSelected] = useState<number[]>([currentPlayer.id])
  const [handicaps, setHandicaps] = useState<Record<number, number>>({ [currentPlayer.id]: currentPlayer.handicap })
  const [matches, setMatches] = useState<MatchDraft[]>([])
  const [error, setError] = useState<string | null>(null)

  // add-new-player inline
  const [newName, setNewName] = useState("")
  const [newLast, setNewLast] = useState("")
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
      const res = await createPlayer({ name: newName, lastName: newLast || undefined, handicap: 0 })
      if (!res.ok) {
        setAddErr(res.error)
        return
      }
      setRoster((r) => [...r, res.player])
      setSelected((s) => [...s, res.player.id])
      setHandicaps((h) => ({ ...h, [res.player.id]: 0 }))
      setNewName("")
      setNewLast("")
    })
  }

  function autoMatch() {
    // Sensible default matches based on the selected group.
    if (selectedPlayers.length === 2) {
      setMatches([{ type: "singles", teamA: [selected[0]], teamB: [selected[1]], bet: 10 }])
    } else if (selectedPlayers.length === 4) {
      setMatches([{ type: "team", teamA: [selected[0], selected[1]], teamB: [selected[2], selected[3]], bet: 20 }])
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
    setMatches((m) => [...m, { type: "singles", teamA: [selected[0]], teamB: [selected[1]], bet: 10 }])
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
      <div className="mb-6 flex items-center gap-2">
        <StepDot n={1} active={step === 1} done={step > 1} label="Players" />
        <div className="h-px flex-1 bg-[var(--color-border)]" />
        <StepDot n={2} active={step === 2} done={false} label="Matches" />
      </div>

      {step === 1 && (
        <div>
          <h1 className="mb-1 font-display text-4xl">Who&apos;s in the group?</h1>
          <p className="mb-5 text-[var(--color-muted)]">Select existing players or add someone new. Set handicaps.</p>

          <div className="mb-4 grid gap-2">
            {roster.map((p) => {
              const on = selected.includes(p.id)
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 rounded-[var(--radius)] border p-3 transition-colors ${
                    on ? "border-[var(--color-primary)] bg-[var(--color-surface-2)]" : "border-[var(--color-border)] bg-[var(--color-surface)]"
                  }`}
                >
                  <button
                    onClick={() => toggle(p.id, p.handicap)}
                    className={`flex h-6 w-6 items-center justify-center rounded-md border ${
                      on ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]" : "border-[var(--color-border)]"
                    }`}
                    aria-label={on ? `Remove ${p.name}` : `Add ${p.name}`}
                  >
                    {on && <Check className="h-4 w-4" strokeWidth={3} />}
                  </button>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface-2)] font-display text-[var(--color-primary)]">
                    {initials(p)}
                  </span>
                  <span className="flex-1 font-medium">{playerLabel(p)}</span>
                  {on && (
                    <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
                      Hcp
                      <input
                        type="number"
                        value={handicaps[p.id] ?? 0}
                        onChange={(e) => setHandicaps((h) => ({ ...h, [p.id]: Number(e.target.value) }))}
                        className="h-9 w-16 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-center text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)]"
                      />
                    </label>
                  )}
                </div>
              )
            })}
          </div>

          <Card className="mb-4 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Plus className="h-4 w-4" /> Add a new player
            </p>
            <form onSubmit={addNewPlayer} className="flex flex-wrap gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="First name"
                className="h-11 min-w-32 flex-1 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 outline-none focus:border-[var(--color-primary)]"
                required
              />
              <input
                value={newLast}
                onChange={(e) => setNewLast(e.target.value)}
                placeholder="Last (if name taken)"
                className="h-11 min-w-32 flex-1 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 outline-none focus:border-[var(--color-primary)]"
              />
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
          <h1 className="mb-1 font-display text-4xl">Set the matches</h1>
          <p className="mb-5 text-[var(--color-muted)]">
            Each match is a Nassau: front 9, back 9, and overall — plus any presses during the round.
          </p>

          <div className="grid gap-4">
            {matches.map((m, i) => (
              <Card key={i} className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex rounded-lg border border-[var(--color-border)] p-0.5">
                    <button
                      onClick={() => updateMatch(i, { type: "singles" })}
                      className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium ${
                        m.type === "singles" ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]" : "text-[var(--color-muted)]"
                      }`}
                    >
                      <User className="h-4 w-4" /> Singles
                    </button>
                    <button
                      onClick={() => updateMatch(i, { type: "team" })}
                      className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium ${
                        m.type === "team" ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]" : "text-[var(--color-muted)]"
                      }`}
                    >
                      <Users className="h-4 w-4" /> Team
                    </button>
                  </div>
                  <button
                    onClick={() => setMatches((ms) => ms.filter((_, idx) => idx !== i))}
                    className="rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)]"
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
                  <span className="text-center font-display text-2xl text-[var(--color-muted)]">vs</span>
                  <TeamPicker
                    label="Team B"
                    players={selectedPlayers}
                    value={m.teamB}
                    single={m.type === "singles"}
                    disabledIds={m.teamA}
                    onChange={(ids) => setSide(i, "teamB", ids)}
                  />
                </div>

                <label className="mt-3 flex items-center gap-2 text-sm">
                  <span className="text-[var(--color-muted)]">Bet per segment</span>
                  <span className="text-[var(--color-gold)]">$</span>
                  <input
                    type="number"
                    value={m.bet}
                    onChange={(e) => updateMatch(i, { bet: Number(e.target.value) })}
                    className="h-9 w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-center outline-none focus:border-[var(--color-primary)]"
                  />
                  <span className="text-xs text-[var(--color-muted)]">× front / back / overall</span>
                </label>
              </Card>
            ))}
          </div>

          <Button variant="outline" className="mt-4 w-full" onClick={addMatch}>
            <Plus className="h-4 w-4" /> Add another match
          </Button>

          {error && <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p>}

          <div className="mt-4 flex gap-2">
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
