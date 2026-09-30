"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { UserPlus, Search, ChevronRight, ArrowLeft } from "lucide-react"
import { selectPlayer, signUpAndSelect } from "@/app/actions/players"
import type { Player } from "@/lib/types"
import { playerLabel } from "@/lib/util"
import { PlayerAvatar } from "./player-avatar"

const fieldClass =
  "liquid-glass-item h-12 w-full rounded-2xl px-4 text-base outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)]"

export function PlayerGate({ players }: { players: Player[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [query, setQuery] = useState("")
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const [lastName, setLastName] = useState("")
  const [handicap, setHandicap] = useState("")
  const [username, setUsername] = useState("")
  const [photo, setPhoto] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const q = query.trim().toLowerCase()
  const filtered = players.filter((p) =>
    [playerLabel(p), p.name, p.lastName, p.nickname].some((v) => v?.toLowerCase().includes(q)),
  )

  function choose(id: number) {
    start(async () => {
      await selectPlayer(id)
      router.push("/new")
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
        nickname: username,
        photo,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.push("/new")
    })
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-10">
      <section
        aria-labelledby="gate-title"
        className="liquid-glass animate-pop w-full max-w-md rounded-[2rem] p-6 sm:p-8"
      >
        <header className="mb-6 flex flex-col items-center text-center">
          <span className="liquid-glass-item mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
            <img src="/space-golf/golfball.png" alt="" className="h-8 w-8" />
          </span>
          <h1 id="gate-title" className="font-display text-4xl leading-none text-balance">
            {adding ? "Create your player" : "Who's playing?"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)] text-pretty">
            {adding ? "A few details and you're on the tee." : "Pick your name to jump in. No password — just golf."}
          </p>
        </header>

        {!adding && (
          <>
            <div className="relative mb-3">
              <label htmlFor="player-search" className="sr-only">Search players</label>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
              <input
                id="player-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search players"
                className={`${fieldClass} pl-11`}
              />
            </div>

            <ul className="-mx-1 mb-4 flex max-h-80 flex-col gap-2 overflow-y-auto px-1 py-1">
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => choose(p.id)}
                    className="liquid-glass-item group flex w-full items-center gap-3 rounded-2xl p-3 text-left outline-none disabled:opacity-50"
                  >
                    <PlayerAvatar player={p} size="lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{playerLabel(p)}</span>
                      <span className="block text-xs text-[var(--color-muted)]">Handicap {p.handicap}</span>
                    </span>
                    <ChevronRight className="h-5 w-5 text-[var(--color-muted)] transition-colors group-hover:text-[var(--color-primary)]" />
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="py-6 text-center text-sm text-[var(--color-muted)]">
                  No players match &ldquo;{query}&rdquo;.
                </li>
              )}
            </ul>

            <div className="mb-4 flex items-center gap-3 text-xs text-[var(--color-muted)]">
              <span className="h-px flex-1 bg-[var(--color-border)]" />
              New here?
              <span className="h-px flex-1 bg-[var(--color-border)]" />
            </div>

            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] font-semibold text-[var(--color-primary-foreground)] transition-opacity hover:opacity-90"
            >
              <UserPlus className="h-5 w-5" /> Create my player
            </button>
          </>
        )}

        {adding && (
          <form onSubmit={submitNew} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="signup-first" className="mb-1 block text-sm font-medium">First name</label>
                <input id="signup-first" autoFocus value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} placeholder="Jordan" required />
              </div>
              <div>
                <label htmlFor="signup-last" className="mb-1 block text-sm font-medium">
                  Last name <span className="font-normal text-[var(--color-muted)]">(opt.)</span>
                </label>
                <input id="signup-last" value={lastName} onChange={(e) => setLastName(e.target.value)} className={fieldClass} placeholder="If name is taken" />
              </div>
            </div>
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <div>
                <label htmlFor="signup-username" className="mb-1 block text-sm font-medium">
                  Username <span className="font-normal text-[var(--color-muted)]">(opt.)</span>
                </label>
                <input id="signup-username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} placeholder="On scorecards" className={fieldClass} />
              </div>
              <div>
                <label htmlFor="signup-handicap" className="mb-1 block text-sm font-medium">Handicap</label>
                <input id="signup-handicap" type="number" value={handicap} onChange={(e) => setHandicap(e.target.value)} className={fieldClass} placeholder="0" />
              </div>
            </div>
            <div>
              <label htmlFor="signup-photo" className="mb-1 block text-sm font-medium">
                Selfie <span className="font-normal text-[var(--color-muted)]">(optional)</span>
              </label>
              <input
                id="signup-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                className="liquid-glass-item block w-full rounded-2xl p-2 text-sm text-[var(--color-muted)] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--color-primary)] file:px-4 file:py-2 file:font-semibold file:text-[var(--color-primary-foreground)]"
              />
              <p className="mt-1 text-xs text-[var(--color-muted)]">JPG, PNG or WebP · Max 3 MB</p>
            </div>
            {error && <p role="alert" className="text-sm text-[var(--color-danger)]">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="liquid-glass-item flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl font-semibold"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <button
                type="submit"
                disabled={pending}
                className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-[var(--color-primary)] font-semibold text-[var(--color-primary-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Creating…" : "Let's play"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
