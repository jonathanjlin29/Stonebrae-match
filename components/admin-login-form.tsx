"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { ShieldCheck } from "lucide-react"
import { adminLogin } from "@/app/actions/admin"
import { Button, Card } from "./ui"

export function AdminLoginForm() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await adminLogin(password)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setPassword("")
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <div className="mb-8 text-center">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-primary)]">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <p className="font-display text-3xl leading-none">Admin access</p>
        <p className="mt-2 text-sm text-[var(--color-muted)]">Enter the admin password to manage players.</p>
      </div>
      <Card className="p-5">
        <form onSubmit={submit} className="grid gap-4">
          <div>
            <label htmlFor="admin-password" className="mb-1 block text-sm font-medium">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 outline-none focus:border-[var(--color-primary)]"
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Checking…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  )
}
