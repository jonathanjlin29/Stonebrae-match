import Link from "next/link"
import { Flag } from "lucide-react"
import { shortLabel } from "@/lib/util"
import type { Player } from "@/lib/types"
import { SignOutButton } from "./sign-out-button"
import { ThemeToggle } from "./theme-toggle"

export function SiteHeader({ player }: { player?: Player | null }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-background)]/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)]">
            <Flag className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <span className="font-display text-2xl uppercase leading-none tracking-wide">Stonebrae Match</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/leaderboard"
            className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
          >
            Leaderboard
          </Link>
          {player && (
            <>
              <Link
                href={`/player/${player.id}`}
                className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
              >
                My Stats
              </Link>
              <span className="hidden rounded-lg bg-[var(--color-surface-2)] px-3 py-2 text-sm font-semibold sm:inline">
                {shortLabel(player)}
              </span>
              <SignOutButton />
            </>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}
