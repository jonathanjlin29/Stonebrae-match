import type { Player } from "./types"

export function playerLabel(p: { name: string; lastName?: string | null }): string {
  return p.lastName ? `${p.name} ${p.lastName}` : p.name
}

export function shortLabel(p: { name: string; lastName?: string | null }): string {
  return p.lastName ? `${p.name} ${p.lastName[0]}.` : p.name
}

export function initials(p: { name: string; lastName?: string | null }): string {
  const a = p.name?.[0] ?? "?"
  const b = p.lastName?.[0] ?? ""
  return (a + b).toUpperCase()
}

export function formatMoney(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : ""
  return `${sign}$${Math.abs(Math.round(n))}`
}

export function moneyClass(n: number): string {
  if (n > 0) return "text-[var(--color-primary)]"
  if (n < 0) return "text-[var(--color-danger)]"
  return "text-[var(--color-muted)]"
}

export function byId(players: Player[]): Record<number, Player> {
  const m: Record<number, Player> = {}
  for (const p of players) m[p.id] = p
  return m
}

const RING_COLORS = ["#15c867", "#ffd700", "#4d8dff", "#ff6b73", "#c07bff", "#3fd8c4"]

export function ringColor(id: number): string {
  return RING_COLORS[Math.abs(id) % RING_COLORS.length]
}
