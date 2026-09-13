import { cookies } from "next/headers"

const COOKIE = "stonebrae_player"

export async function getCurrentPlayerId(): Promise<number | null> {
  const store = await cookies()
  const raw = store.get(COOKIE)?.value
  if (!raw) return null
  const id = Number.parseInt(raw, 10)
  return Number.isFinite(id) ? id : null
}

export async function setCurrentPlayerId(id: number) {
  const store = await cookies()
  store.set(COOKIE, String(id), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
}

export async function clearCurrentPlayer() {
  const store = await cookies()
  store.delete(COOKIE)
}
