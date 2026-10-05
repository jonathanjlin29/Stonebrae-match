"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { WifiOff, RefreshCw } from "lucide-react"

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    console.error("[app] Recovered from error", error)
    setOnline(navigator.onLine)
    const update = () => setOnline(navigator.onLine)
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [error])

  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <WifiOff className="h-8 w-8 text-[var(--color-muted)]" aria-hidden />
      <h1 className="font-display text-2xl tracking-tight">
        {online ? "Something hiccuped" : "You're offline"}
      </h1>
      <p className="text-pretty text-sm leading-relaxed text-[var(--color-muted)]">
        Any scores you entered are saved on this phone and will upload automatically when you have signal.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={reset}
          className="flex items-center gap-1.5 rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-primary-foreground)]"
        >
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
        <Link href="/" className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--color-muted)]">
          Home
        </Link>
      </div>
    </main>
  )
}
