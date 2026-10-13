"use client"

import { Pencil, Swords } from "lucide-react"
import { computeMatchMoney, computeSegmentStatus, pressEndHole } from "@/lib/nassau"
import type { Hole } from "@/lib/course"
import type { Match, Player, Scores } from "@/lib/types"
import { formatMoney, moneyClass, shortLabel } from "@/lib/util"

type CompactPlayer = { id: number; name: string; lastName: string | null; nickname: string | null; handicap: number }

function shortStatus(holes: number, frozen: boolean, closeout: string | null | undefined, statusA: number, sign: number) {
  if (!holes) return "—"
  if (frozen && closeout) return closeout.replace(/\s+/g, "")
  const v = statusA * sign
  return v === 0 ? "AS" : `${Math.abs(v)}${v > 0 ? "U" : "D"}`
}

function toneFor(holes: number, statusA: number, sign: number) {
  if (!holes) return "text-[var(--color-muted)]"
  const v = statusA * sign
  return v > 0 ? "text-[var(--color-primary)]" : v < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-match-square)]"
}

export function MatchCompactList({
  matches,
  scores,
  players,
  courseHoles,
  currentPlayerId,
  canEdit,
  onEdit,
}: {
  matches: Match[]
  scores: Scores
  players: CompactPlayer[]
  courseHoles: Hole[]
  currentPlayerId: number | null
  canEdit: boolean
  onEdit: (matchId: number) => void
}) {
  const byId = Object.fromEntries(players.map((p) => [p.id, p]))

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_2.5rem_2.5rem_3.5rem] items-center gap-1 border-b border-[var(--color-border)] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        <span>Match</span>
        <span className="text-center">F</span>
        <span className="text-center">B</span>
        <span className="text-center">Tot</span>
        <span className="text-right">$</span>
      </div>
      <ul className="divide-y divide-[var(--color-border)]">
        {matches.map((m) => {
          const viewerSide = currentPlayerId != null && m.teamB.includes(currentPlayerId) ? "B" : "A"
          const sign = viewerSide === "B" ? -1 : 1
          const segs = ([[0, 8], [9, 17], [0, 17]] as const).map(([s, e]) =>
            computeSegmentStatus(m, scores, players, s, e, courseHoles),
          )
          const { money } = computeMatchMoney(m, scores, players as unknown as Player[], courseHoles)
          const sideIds = viewerSide === "B" ? m.teamB : m.teamA
          const sideMoney = sideIds.reduce((sum, id) => sum + (money[id] ?? 0), 0)
          const pressChips = m.presses.map((p) => {
            const st = computeSegmentStatus(m, scores, players, p.startHole, pressEndHole(p.scope), courseHoles)
            const isAloha = p.scope === "back" && p.startHole === 17
            return {
              id: p.id,
              tag: isAloha ? "Aloha" : `${p.scope === "front" ? "F" : p.scope === "back" ? "B" : "T"}${p.startHole + 1}`,
              status: shortStatus(st.holes.length, st.frozen, st.closeoutLabel, st.finalStatusA, sign),
              tone: toneFor(st.holes.length, st.finalStatusA, sign),
              amount: p.amount,
            }
          })
          const nameA = m.teamA.map((id) => shortLabel(byId[id])).join(" & ")
          const nameB = m.teamB.map((id) => shortLabel(byId[id])).join(" & ")

          return (
            <li key={m.id}>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => onEdit(m.id)}
                aria-label={canEdit ? `Edit ${nameA} vs ${nameB}` : undefined}
                className="grid w-full grid-cols-[minmax(0,1fr)_2.5rem_2.5rem_2.5rem_3.5rem] items-center gap-1 px-3 py-2 text-left enabled:hover:bg-[var(--color-surface-2)]"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1 truncate text-[13px] font-semibold leading-tight">
                    <span className="truncate">{nameA}</span>
                    <span className="shrink-0 text-[10px] font-normal text-[var(--color-muted)]">v</span>
                    <span className="truncate">{nameB}</span>
                    {canEdit && <Pencil className="h-3 w-3 shrink-0 text-[var(--color-muted)]" aria-hidden />}
                  </span>
                  <span className="truncate text-[11px] leading-tight text-[var(--color-muted)] tabular">
                    ${m.nineBet}/${m.backBet}/${m.overallBet}
                    {m.straightUp ? " · straight" : ""}
                  </span>
                </span>
                {segs.map((st, i) => (
                  <span key={i} className={`text-center text-xs font-bold tabular ${toneFor(st.holes.length, st.finalStatusA, sign)}`}>
                    {shortStatus(st.holes.length, st.frozen, st.closeoutLabel, st.finalStatusA, sign)}
                  </span>
                ))}
                <span className={`text-right text-xs font-bold tabular ${moneyClass(sideMoney)}`}>{formatMoney(sideMoney)}</span>
                {pressChips.length > 0 && (
                  <span className="col-span-5 flex flex-wrap items-center gap-1" aria-label="Presses">
                    <Swords className="h-3 w-3 shrink-0 text-[var(--color-gold)]" aria-hidden />
                    {pressChips.map((c) => (
                      <span
                        key={c.id}
                        title={`Press ${c.tag} · $${c.amount}`}
                        className="flex items-center gap-1 rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] leading-none tabular"
                      >
                        <span className="font-semibold text-[var(--color-muted)]">{c.tag}</span>
                        <span className={`font-bold ${c.tone}`}>{c.status}</span>
                      </span>
                    ))}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
