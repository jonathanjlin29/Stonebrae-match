import { cookies } from "next/headers"

const COOKIE = "stonebrae_player"

// The v0 preview renders the app inside a cross-site iframe, so a "lax"
// cookie is silently dropped by the browser and the session never sticks.
// Use "none" (which requires secure) in development to survive that iframe;
// production is same-origin so "lax" is fine and more conservative.
const isDev = process.env.NODE_ENV === "development"

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
    sameSite: isDev ? "none" : "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
}

export async function clearCurrentPlayer() {
  const store = await cookies()
  store.delete(COOKIE)
}
