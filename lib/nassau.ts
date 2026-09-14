import { COURSE } from "./course"
import type { Match, Player, Scores } from "./types"

// ─── HANDICAP HELPERS ──────────────────────────────────────────────
export function getStrokesGiven(playerHcp: number, lowestHcp: number, holeHcp: number): number {
  const diff = playerHcp - lowestHcp
  if (diff <= 0) return 0
  const base = Math.floor(diff / 18)
  const extra = diff % 18
  return base + (holeHcp <= extra ? 1 : 0)
}

type PlayerMap = Record<number, Player>

function toPlayerMap(players: Player[]): PlayerMap {
  const m: PlayerMap = {}
  for (const p of players) m[p.id] = p
  return m
}

// Returns cumulative status for team A over a hole range [start..end] (0-indexed inclusive)
export function computeMatchStatus(
  match: Match,
  scores: Scores,
  players: Player[],
  start = 0,
  end = 17,
): { hole: number; holeWinner: "A" | "B" | "halved"; statusA: number }[] {
  const map = toPlayerMap(players)
  const all = [...match.teamA, ...match.teamB]
  if (all.some((id) => !map[id])) return []

  const lowestHcp = Math.min(...all.map((id) => map[id].handicap))
  let cumulativeA = 0
  const results: { hole: number; holeWinner: "A" | "B" | "halved"; statusA: number }[] = []

  for (let h = start; h <= end; h++) {
    const entered = all.every((id) => scores[id] && scores[id][h] != null)
    if (!entered) continue
    const hole = COURSE.holes[h]
    const holeHcp = hole.hcp
    let netA: number
    let netB: number

    if (match.type === "team") {
      const nA = match.teamA.map((id) => (scores[id][h] as number) - getStrokesGiven(map[id].handicap, lowestHcp, holeHcp))
      const nB = match.teamB.map((id) => (scores[id][h] as number) - getStrokesGiven(map[id].handicap, lowestHcp, holeHcp))
      netA = Math.min(...nA)
      netB = Math.min(...nB)
    } else {
      const idA = match.teamA[0]
      const idB = match.teamB[0]
      netA = (scores[idA][h] as number) - getStrokesGiven(map[idA].handicap, lowestHcp, holeHcp)
      netB = (scores[idB][h] as number) - getStrokesGiven(map[idB].handicap, lowestHcp, holeHcp)
    }

    let holeWinner: "A" | "B" | "halved"
    if (netA < netB) {
      holeWinner = "A"
      cumulativeA++
    } else if (netB < netA) {
      holeWinner = "B"
      cumulativeA--
    } else {
      holeWinner = "halved"
    }
    results.push({ hole: h, holeWinner, statusA: cumulativeA })
  }
  return results
}

export function getMatchStatusLabel(statusA: number): string {
  if (statusA === 0) return "AS"
  if (statusA > 0) return `${statusA} UP`
  return `${Math.abs(statusA)} DN`
}

export type SegmentStatus = {
  // Hole-by-hole results within the segment, truncated at the freeze point (if any) so holes
  // played after a mathematically decided outcome are not counted.
  holes: { hole: number; holeWinner: "A" | "B" | "halved"; statusA: number }[]
  finalStatusA: number
  frozen: boolean
  frozenAtHole: number | null // 0-indexed hole that clinched the segment
  // Standard match-play closeout notation, e.g. "5&4" for 5 up with 4 to play.
  closeoutLabel: string | null
}

// Computes a segment's (front/back/overall/press) hole-by-hole status, then detects dormie/
// closeout: once a side's lead exceeds the holes remaining in the segment, the outcome can no
// longer change, so the segment "freezes" — later holes are ignored for this segment even if
// they get entered (other segments keep counting independently).
export function computeSegmentStatus(
  match: Match,
  scores: Scores,
  players: Player[],
  start: number,
  end: number,
): SegmentStatus {
  const raw = computeMatchStatus(match, scores, players, start, end)
  const totalHoles = end - start + 1
  const holes: SegmentStatus["holes"] = []
  let frozen = false
  let frozenAtHole: number | null = null
  let closeoutLabel: string | null = null

  for (const r of raw) {
    holes.push(r)
    const holesPlayed = r.hole - start + 1
    const holesRemaining = totalHoles - holesPlayed
    if (holesRemaining > 0 && Math.abs(r.statusA) > holesRemaining) {
      frozen = true
      frozenAtHole = r.hole
      closeoutLabel = `${Math.abs(r.statusA)}&${holesRemaining}`
      break
    }
  }

  const finalStatusA = holes.length > 0 ? holes[holes.length - 1].statusA : 0
  return { holes, finalStatusA, frozen, frozenAtHole, closeoutLabel }
}

function segmentWinner(match: Match, scores: Scores, players: Player[], start: number, end: number): "A" | "B" | "halved" | null {
  const status = computeSegmentStatus(match, scores, players, start, end)
  if (status.holes.length === 0) return null
  if (status.finalStatusA > 0) return "A"
  if (status.finalStatusA < 0) return "B"
  return "halved"
}

// Divides a whole-dollar amount into `n` whole-dollar shares as evenly as possible.
// The remainder (if any) is distributed one dollar at a time to the first shares, so
// the returned shares always sum exactly to `amount`.
export function splitInteger(amount: number, n: number): number[] {
  if (n <= 0) return []
  const whole = Math.round(amount)
  const base = Math.floor(whole / n)
  const remainder = whole - base * n
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0))
}

// ─── MONEY ─────────────────────────────────────────────────────────
// Nassau: front (1-9) and back (10-18) are each worth `nineBet`; overall (1-18)
// is worth `overallBet`. Each press is worth its parent segment's bet over its
// own hole range. Winning team collectively wins the bet, split evenly; losing
// team splits the loss. All splits use whole dollars so every player's money is
// an integer and each segment nets to exactly zero across both teams.
export function computeMatchMoney(match: Match, scores: Scores, players: Player[]) {
  const money: Record<number, number> = {}
  for (const id of [...match.teamA, ...match.teamB]) money[id] = 0

  const applySegment = (winner: "A" | "B" | "halved" | null, amount: number) => {
    if (!winner || winner === "halved") return
    const winners = winner === "A" ? match.teamA : match.teamB
    const losers = winner === "A" ? match.teamB : match.teamA
    const winShares = splitInteger(Math.round(amount), winners.length)
    const loseShares = splitInteger(Math.round(amount), losers.length)
    winners.forEach((id, i) => (money[id] += winShares[i]))
    losers.forEach((id, i) => (money[id] -= loseShares[i]))
  }

  const front = segmentWinner(match, scores, players, 0, 8)
  const back = segmentWinner(match, scores, players, 9, 17)
  const overall = segmentWinner(match, scores, players, 0, 17)
  applySegment(front, match.nineBet)
  applySegment(back, match.nineBet)
  applySegment(overall, match.overallBet)

  const pressResults: Record<string, "A" | "B" | "halved" | null> = {}
  for (const press of match.presses ?? []) {
    const end = press.scope === "front" ? 8 : 17
    const w = segmentWinner(match, scores, players, press.startHole, end)
    pressResults[press.id] = w
    const defaultAmount = press.scope === "overall" ? match.overallBet : match.nineBet
    applySegment(w, press.amount ?? defaultAmount)
  }

  return { money, results: { front, back, overall, pressResults } }
}

// ─── PERSONAL STAT DETECTORS ───────────────────────────────────────
type Rel = "eagle" | "birdie" | "par" | "bogey" | "double+" | null

export function relToPar(strokes: number | null, par: number): Rel {
  if (strokes == null) return null
  const d = strokes - par
  if (d <= -2) return "eagle"
  if (d === -1) return "birdie"
  if (d === 0) return "par"
  if (d === 1) return "bogey"
  return "double+"
}

// A "bounce back": par or better immediately after a bogey or worse.
export function isBounceBack(holeScores: (number | null)[], holeIndex: number): boolean {
  if (holeIndex <= 0) return false
  const prev = holeScores[holeIndex - 1]
  const cur = holeScores[holeIndex]
  if (prev == null || cur == null) return false
  const prevPar = COURSE.holes[holeIndex - 1].par
  const curPar = COURSE.holes[holeIndex].par
  return prev - prevPar >= 1 && cur - curPar <= 0
}

// Current consecutive-birdie (or better) streak ending at holeIndex.
export function birdieStreakEndingAt(holeScores: (number | null)[], holeIndex: number): number {
  let streak = 0
  for (let h = holeIndex; h >= 0; h--) {
    const s = holeScores[h]
    if (s == null) break
    if (s - COURSE.holes[h].par <= -1) streak++
    else break
  }
  return streak
}

export type PlayerAnalytics = {
  roundsPlayed: number
  totalMoney: number
  frontAvg: number | null
  backAvg: number | null
  frontVsPar: number | null
  backVsPar: number | null
  bounceBackOpportunities: number
  bounceBacks: number
  bounceBackRate: number | null
  fireHotStreaks: number // count of 2+ consecutive birdie sequences
  longestBirdieStreak: number
  pressesWon: number
  pressesLost: number
  pressesPlayed: number
}
