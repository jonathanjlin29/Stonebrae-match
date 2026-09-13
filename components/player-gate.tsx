"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { UserPlus, Search, ChevronRight } from "lucide-react"
import { selectPlayer, signUpAndSelect } from "@/app/actions/players"
import type { Player } from "@/lib/types"
import { initials, playerLabel } from "@/lib/util"
import { Button, Card } from "./ui"

export function PlayerGate({ players }: { players: Player[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [query, setQuery] = useState("")
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const [lastName, setLastName] = useState("")
  const [handicap, setHandicap] = useState("")
  const [error, setError] = useState<string | null>(null)

  const filtered = players.filter((p) => playerLabel(p).toLowerCase().includes(query.trim().toLowerCase()))

  function choose(id: number) {
    start(async () => {
      await selectPlayer(id)
      router.refresh()
    })
  }

  function submitNew(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await signUpAndSelect({
        name,
        lastName: lastName || undefined,
        handicap: handicap ? Number(handicap) : 0,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="mb-8 text-center">
        <p className="font-display text-5xl leading-none text-[var(--color-primary)]">Who&apos;s playing?</p>
        <p className="mt-2 text-[var(--color-muted)]">Pick your name to jump in. No password — just golf.</p>
      </div>

      {!adding && (
        <>
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search players"
              className="h-12 w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] pl-10 pr-4 text-base outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          <div className="mb-4 grid gap-2">
            {filtered.map((p) => (
              <button
                key={p.id}
                disabled={pending}
                onClick={() => choose(p.id)}
                className="group flex items-center gap-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-surface-2)] font-display text-lg text-[var(--color-primary)]">
                  {initials(p)}
                </span>
                <span className="flex-1">
                  <span className="block font-semibold">{playerLabel(p)}</span>
                  <span className="block text-xs text-[var(--color-muted)]">Handicap {p.handicap}</span>
                </span>
                <ChevronRight className="h-5 w-5 text-[var(--color-muted)] group-hover:text-[var(--color-primary)]" />
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-[var(--color-muted)]">
                No players match &ldquo;{query}&rdquo;.
              </p>
            )}
          </div>

          <Button variant="outline" size="lg" className="w-full" onClick={() => setAdding(true)}>
            <UserPlus className="h-5 w-5" /> I&apos;m new — create my player
          </Button>
        </>
      )}

      {adding && (
        <Card className="p-5">
          <form onSubmit={submitNew} className="grid gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">First name</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-12 w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 outline-none focus:border-[var(--color-primary)]"
                placeholder="e.g. Jordan"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Last name <span className="text-[var(--color-muted)]">(optional)</span>
              </label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="h-12 w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 outline-none focus:border-[var(--color-primary)]"
                placeholder="Needed only if your first name is taken"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Handicap</label>
              <input
                type="number"
                value={handicap}
                onChange={(e) => setHandicap(e.target.value)}
                className="h-12 w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 outline-none focus:border-[var(--color-primary)]"
                placeholder="0"
              />
            </div>
            {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setAdding(false)}>
                Back
              </Button>
              <Button type="submit" className="flex-1" disabled={pending}>
                {pending ? "Creating…" : "Let's play"}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  )
}
