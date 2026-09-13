import type { Hole } from "./course"

export type Player = {
  id: number
  name: string
  lastName: string | null
  handicap: number
}

export type RoundPlayer = Player & {
  roundHandicap: number
  moneyWon: number
}

export type Press = {
  id: string
  matchId: number
  scope: "front" | "back"
  startHole: number // 0-indexed
  initiatedBy: "A" | "B"
}

export type MatchResults = {
  front: "A" | "B" | "halved" | null
  back: "A" | "B" | "halved" | null
  overall: "A" | "B" | "halved" | null
  pressResults: Record<string, "A" | "B" | "halved" | null>
}

export type Match = {
  id: number
  roundId: number
  type: "singles" | "team"
  teamA: number[]
  teamB: number[]
  nineBet: number
  overallBet: number
  presses: Press[]
  results: MatchResults
  money: Record<string, number>
}

export type Scores = Record<number, (number | null)[]> // playerId -> 18 holes

export type Round = {
  id: number
  courseName: string
  holes: Hole[]
  status: "active" | "completed"
  createdBy: number | null
  createdAt: string
  completedAt: string | null
  players: RoundPlayer[]
  scores: Scores
  matches: Match[]
}
