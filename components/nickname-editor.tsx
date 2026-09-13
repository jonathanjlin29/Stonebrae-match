"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Pencil, Check, X } from "lucide-react"
import { updateNickname } from "@/app/actions/players"
import { Button, Card } from "./ui"

export function NicknameEditor({ currentNickname }: { currentNickname: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(currentNickname ?? "")
  const [error, setError] = useState<string | null>(null)

  function save() {
    setError(null)
    start(async () => {
      const res = await updateNickname(value)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setEditing(false)
      router.refresh()
    })
  }

  if (!editing) {
    return (
      <Card className="mb-6 flex items-center justify-between p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Nickname</p>
          <p className="font-display text-lg">{currentNickname || "None set"}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { setValue(currentNickname ?? ""); setError(null); setEditing(true) }}>
          <Pencil className="h-4 w-4" /> Edit
        </Button>
      </Card>
    )
  }

  return (
    <Card className="mb-6 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Nickname <span className="font-normal text-[var(--color-muted)]">(shows everywhere instead of your name)</span>
      </p>
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={20}
          placeholder="e.g. The Hammer"
          className="h-11 flex-1 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 outline-none focus:border-[var(--color-primary)]"
        />
        <Button size="sm" onClick={save} disabled={pending} aria-label="Save nickname">
          <Check className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setEditing(false)
            setValue(currentNickname ?? "")
            setError(null)
          }}
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
    </Card>
  )
}
