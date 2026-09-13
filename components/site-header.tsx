import Link from "next/link"
import { Flag } from "lucide-react"
import { shortLabel } from "@/lib/util"
import type { Player } from "@/lib/types"
import { SignOutButton } from "./sign-out-button"
import { ThemeToggle } from "./theme-toggle"

export function SiteHeader({ player }: { player?: Player | null }) {
  return (
    <header className="glass sticky top-0 z-30">
      <div className="mx-auto flex h-[68px] max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-[0_6px_16px_-4px_hsl(150_70%_40%/0.55)]">
            <Flag className="h-4.5 w-4.5" strokeWidth={2.5} />
          </span>
          <span className="font-display text-lg leading-none tracking-tight">Stonebrae Match</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-1.5">
          <Link
            href="/leaderboard"
            className="rounded-full px-3.5 py-2 text-sm font-semibold text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
          >
            Leaderboard
          </Link>
          {player && (
            <>
              <Link
                href={`/player/${player.id}`}
                className="rounded-full px-3.5 py-2 text-sm font-semibold text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
              >
                My Stats
              </Link>
              <span className="hidden rounded-full bg-[var(--color-surface-2)] px-3.5 py-2 text-sm font-semibold sm:inline">
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
