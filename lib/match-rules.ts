type Named = { id: number; nickname?: string | null }

// These two always play each other heads-up with no strokes given.
const STRAIGHT_UP_PAIR = ["jleezy", "sabooboo"] as const

function isPairMember(p: Named | undefined, nickname: (typeof STRAIGHT_UP_PAIR)[number]) {
  return p?.nickname?.trim().toLowerCase() === nickname
}

export function findStraightUpPair(players: Named[]): [number, number] | null {
  const a = players.find((p) => isPairMember(p, STRAIGHT_UP_PAIR[0]))
  const b = players.find((p) => isPairMember(p, STRAIGHT_UP_PAIR[1]))
  return a && b ? [a.id, b.id] : null
}

export function isStraightUpMatchup(teamA: number[], teamB: number[], players: Named[]): boolean {
  if (teamA.length !== 1 || teamB.length !== 1) return false
  const pair = findStraightUpPair(players)
  if (!pair) return false
  const ids = [teamA[0], teamB[0]]
  return ids.includes(pair[0]) && ids.includes(pair[1])
}
