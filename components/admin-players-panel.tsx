"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { ShieldCheck, LogOut, Trash2, Save, X } from "lucide-react"
import { adminLogout, deletePlayerAdmin, updatePlayerAdmin } from "@/app/actions/admin"
import type { Player } from "@/lib/types"
import { initials, playerLabel } from "@/lib/util"
import { Button, Card, PlayerAvatar } from "./ui"

export function AdminPlayersPanel({ players }: { players: Player[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function logout() {
    start(async () => {
      await adminLogout()
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-[var(--color-primary)]" />
          <h1 className="font-display text-3xl">Admin</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={logout} disabled={pending}>
          <LogOut className="h-4 w-4" /> Log out
        </Button>
      </div>

      <p className="mb-4 text-sm text-[var(--color-muted)]">
        Edit a player&apos;s name or handicap, or remove players who have never played a round. Score and bet amounts
        can be edited directly on each round&apos;s scorecard.
      </p>

      <div className="grid gap-3">
        {players.map((p) => (
          <PlayerRow key={p.id} player={p} />
        ))}
        {players.length === 0 && <Card className="p-6 text-center text-sm text-[var(--color-muted)]">No players yet.</Card>}
      </div>
    </div>
  )
}

function PlayerRow({ player }: { player: Player }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(player.name)
  const [lastName, setLastName] = useState(player.lastName ?? "")
  const [handicap, setHandicap] = useState(String(player.handicap))
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function save() {
    setError(null)
    start(async () => {
      const res = await updatePlayerAdmin(player.id, {
        name,
        lastName: lastName || null,
        handicap: handicap ? Number(handicap) : 0,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setEditing(false)
      router.refresh()
    })
  }

  function remove() {
    setError(null)
    start(async () => {
      const res = await deletePlayerAdmin(player.id)
      if (!res.ok) {
        setError(res.error)
        setConfirmingDelete(false)
        return
      }
      router.refresh()
    })
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <PlayerAvatar player={player} size="md" />
        {!editing ? (
          <>
            <div className="flex-1">
              <p className="font-semibold">{playerLabel(player)}</p>
              <p className="text-xs text-[var(--color-muted)]">
                {player.name}
                {player.lastName ? ` ${player.lastName}` : ""} · Handicap {player.handicap}
                {player.nickname ? ` · nickname "${player.nickname}"` : ""}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
            {!confirmingDelete ? (
              <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)} aria-label="Delete player">
                <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
              </Button>
            ) : (
              <div className="flex items-center gap-1.5">
                <Button variant="danger" size="sm" onClick={remove} disabled={pending}>
                  {pending ? "…" : "Confirm"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)} aria-label="Cancel">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1">
            <div className="grid grid-cols-3 gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="First name"
                className="h-10 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-[var(--color-primary)]"
              />
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                className="h-10 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-[var(--color-primary)]"
              />
              <input
                type="number"
                value={handicap}
                onChange={(e) => setHandicap(e.target.value)}
                placeholder="Handicap"
                className="h-10 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={save} disabled={pending}>
                <Save className="h-4 w-4" /> {pending ? "Saving…" : "Save"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false)
                  setName(player.name)
                  setLastName(player.lastName ?? "")
                  setHandicap(String(player.handicap))
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
    </Card>
  )
}
