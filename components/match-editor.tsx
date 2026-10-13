"use client"

import { useState, useTransition } from "react"
import { Plus, Trash2, X } from "lucide-react"
import { deleteMatchOffline, updateMatchOffline } from "@/lib/offline-actions"
import { isStraightUpMatchup } from "@/lib/match-rules"
import { backBetOf, defaultPressAmount } from "@/lib/nassau"
import type { Match, Press } from "@/lib/types"
import { shortLabel } from "@/lib/util"
import { Button } from "./ui"

type EditorPlayer = { id: number; name: string; lastName: string | null; nickname: string | null; handicap: number }
type Side = "A" | "B" | null
type Scope = Press["scope"]

const inputCls =
  "h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-center font-semibold tabular outline-none focus:border-[var(--color-primary)]"

export function MatchEditor({
  roundId,
  match,
  players,
  onSaved,
  onDeleted,
  onClose,
}: {
  roundId: number
  match: Match
  players: EditorPlayer[]
  onSaved: (match: Match) => void
  onDeleted: (matchId: number) => void
  onClose: () => void
}) {
  const [sides, setSides] = useState<Record<number, Side>>(() =>
    Object.fromEntries(
      players.map((p) => [p.id, match.teamA.includes(p.id) ? "A" : match.teamB.includes(p.id) ? "B" : null]),
    ),
  )
  const [frontBet, setFrontBet] = useState(String(match.nineBet))
  const [backBet, setBackBet] = useState(String(backBetOf(match)))
  const [overallBet, setOverallBet] = useState(String(match.overallBet))
  const [straightUp, setStraightUp] = useState(match.straightUp)
  const [presses, setPresses] = useState<Press[]>(() => match.presses.map((p) => ({ ...p })))
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, start] = useTransition()

  const teamA = players.filter((p) => sides[p.id] === "A").map((p) => p.id)
  const teamB = players.filter((p) => sides[p.id] === "B").map((p) => p.id)
  const forcedStraightUp = isStraightUpMatchup(teamA, teamB, players)
  const effectiveStraightUp = straightUp || forcedStraightUp

  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0))

  function updatePress(id: string, patch: Partial<Press>) {
    setPresses((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  function addPressRow(scope: Scope) {
    const startHole = scope === "back" ? 9 : 0
    const draft: Match = { ...match, nineBet: num(frontBet), backBet: num(backBet), overallBet: num(overallBet) }
    setPresses((prev) => [
      ...prev,
      {
        id: `p${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        matchId: match.id,
        scope,
        startHole,
        initiatedBy: "A",
        amount: defaultPressAmount(draft, scope),
      },
    ])
  }

  function save() {
    setError(null)
    if (teamA.length === 0 || teamB.length === 0) {
      setError("Both sides need at least one player.")
      return
    }
    const edit = {
      type: (teamA.length === 1 && teamB.length === 1 ? "singles" : "team") as Match["type"],
      teamA,
      teamB,
      nineBet: num(frontBet),
      backBet: num(backBet),
      overallBet: num(overallBet),
      straightUp: effectiveStraightUp,
      presses: presses.map((p) => ({ ...p, amount: Math.max(0, Math.round(p.amount || 0)) })),
    }
    start(async () => {
      const res = await updateMatchOffline(roundId, match.id, edit)
      if (!res.ok) {
        setError(res.error)
        return
      }
      onSaved({ ...match, ...edit })
      onClose()
    })
  }

  function remove() {
    start(async () => {
      const res = await deleteMatchOffline(roundId, match.id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      onDeleted(match.id)
    })
  }

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-[var(--color-border)] pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Edit match</h3>
        <button
          onClick={onClose}
          aria-label="Close editor"
          className="rounded-full p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Sides</legend>
        {players.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2">
            <span className="truncate text-sm">
              {shortLabel(p)} <span className="text-xs text-[var(--color-muted)] tabular">({p.handicap})</span>
            </span>
            <div className="flex shrink-0 rounded-full bg-[var(--color-surface-2)] p-0.5 text-xs font-semibold">
              {(["A", "B", null] as Side[]).map((s) => (
                <button
                  key={String(s)}
                  type="button"
                  aria-pressed={sides[p.id] === s}
                  onClick={() => setSides((prev) => ({ ...prev, [p.id]: s }))}
                  className={`rounded-full px-3 py-1 transition-colors ${
                    sides[p.id] === s
                      ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                      : "text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                  }`}
                >
                  {s ?? "Out"}
                </button>
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Bets ($)</legend>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
            Front 9
            <input type="number" inputMode="numeric" min={0} value={frontBet} onChange={(e) => setFrontBet(e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
            Back 9
            <input type="number" inputMode="numeric" min={0} value={backBet} onChange={(e) => setBackBet(e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
            Overall
            <input type="number" inputMode="numeric" min={0} value={overallBet} onChange={(e) => setOverallBet(e.target.value)} className={inputCls} />
          </label>
        </div>
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={effectiveStraightUp}
          disabled={forcedStraightUp}
          onChange={(e) => setStraightUp(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
        />
        <span className="flex flex-col">
          <span className="font-medium">Straight up (no handicap strokes)</span>
          {forcedStraightUp && (
            <span className="text-xs text-[var(--color-muted)]">JLeezy vs Sabooboo always plays straight up.</span>
          )}
        </span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Presses ({presses.length})
        </legend>
        {presses.length === 0 && <p className="text-sm text-[var(--color-muted)]">No presses.</p>}
        {presses.map((p) => {
          const [lo, hi] = p.scope === "back" ? [10, 18] : p.scope === "front" ? [1, 9] : [1, 18]
          return (
            <div key={p.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-1.5 rounded-lg bg-[var(--color-surface-2)] p-2">
              <select
                aria-label="Press segment"
                value={p.scope}
                onChange={(e) => {
                  const scope = e.target.value as Scope
                  updatePress(p.id, { scope, startHole: scope === "back" ? Math.max(9, p.startHole) : Math.min(scope === "front" ? 8 : 17, p.startHole) })
                }}
                className="h-8 min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1 text-xs font-semibold"
              >
                <option value="front">Front</option>
                <option value="back">Back</option>
                <option value="overall">Overall</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
                #
                <input
                  type="number"
                  aria-label="Starting hole"
                  min={lo}
                  max={hi}
                  value={p.startHole + 1}
                  onChange={(e) => {
                    const h = Math.min(hi, Math.max(lo, Math.round(Number(e.target.value) || lo)))
                    updatePress(p.id, { startHole: h - 1 })
                  }}
                  className="h-8 w-11 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-center text-xs font-semibold tabular"
                />
              </label>
              <select
                aria-label="Pressed by"
                value={p.initiatedBy}
                onChange={(e) => updatePress(p.id, { initiatedBy: e.target.value as "A" | "B" })}
                className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1 text-xs font-semibold"
              >
                <option value="A">by A</option>
                <option value="B">by B</option>
              </select>
              <label className="flex items-center gap-0.5 text-xs text-[var(--color-muted)]">
                $
                <input
                  type="number"
                  aria-label="Press amount"
                  min={0}
                  value={p.amount}
                  onChange={(e) => updatePress(p.id, { amount: Number(e.target.value) })}
                  className="h-8 w-12 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-center text-xs font-semibold tabular"
                />
              </label>
              <button
                type="button"
                onClick={() => setPresses((prev) => prev.filter((x) => x.id !== p.id))}
                aria-label="Remove press"
                className="rounded-full p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
        <div className="flex flex-wrap gap-1.5">
          {(["front", "back", "overall"] as Scope[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addPressRow(s)}
              className="flex items-center gap-1 rounded-full border border-dashed border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
            >
              <Plus className="h-3 w-3" /> {s === "front" ? "Front" : s === "back" ? "Back" : "Overall"} press
            </button>
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm font-medium text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {confirmDelete ? (
          <div className="flex items-center gap-1.5">
            <Button variant="danger" onClick={remove} disabled={pending} className="h-9 px-3 text-sm">
              <Trash2 className="h-4 w-4" /> Delete match
            </Button>
            <button onClick={() => setConfirmDelete(false)} className="px-2 text-sm text-[var(--color-muted)]">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-danger)]"
          >
            Delete match
          </button>
        )}
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm font-semibold text-[var(--color-muted)] hover:text-[var(--color-foreground)]">
            Cancel
          </button>
          <Button onClick={save} disabled={pending} className="h-9 px-4 text-sm">
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  )
}
