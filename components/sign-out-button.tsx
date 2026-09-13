"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { LogOut } from "lucide-react"
import { signOut } from "@/app/actions/players"

export function SignOutButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button
      aria-label="Switch player"
      title="Switch player"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await signOut()
          router.refresh()
        })
      }
      className="rounded-lg p-2 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] disabled:opacity-50"
    >
      <LogOut className="h-4 w-4" />
    </button>
  )
}
