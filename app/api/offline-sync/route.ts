import { NextResponse } from "next/server"
import { saveScore, addPress, completeRound, createRound, updatePressAmount } from "@/app/actions/rounds"
import { createPlayer } from "@/app/actions/players"

const handlers = {
  createPlayer: (payload: any) => createPlayer(payload),
  createRound: (payload: any) => createRound(payload),
  saveScore: (payload: any) => saveScore(payload.roundId, payload.playerId, payload.hole, payload.strokes),
  addPress: (payload: any) =>
    addPress(payload.roundId, payload.matchId, payload.scope, payload.startHole, payload.initiatedBy, payload.amount),
  updatePressAmount: (payload: any) =>
    updatePressAmount(payload.roundId, payload.matchId, payload.pressId, payload.amount),
  completeRound: (payload: any) => completeRound(payload.roundId),
} as const

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const handler = handlers[body.action as keyof typeof handlers]
    if (!handler || !body.payload) return NextResponse.json({ error: "Unsupported offline action" }, { status: 400 })
    const result = await handler(body.payload)
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    console.error("[v0] Offline mutation replay failed", error)
    return NextResponse.json({ error: "Replay failed" }, { status: 409 })
  }
}
