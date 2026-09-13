"use client"

import { useState } from "react"
import { clsx } from "clsx"
import { initials, ringColor } from "@/lib/util"
import type { Player } from "@/lib/types"

const sizes = { sm: "h-8 w-8 text-sm", md: "h-9 w-9 text-sm", lg: "h-12 w-12 text-base" }

export function PlayerAvatar({ player, size = "md", className }: {
  player: Pick<Player, "id" | "name" | "lastName"> & { photoUrl?: string | null }
  size?: keyof typeof sizes
  className?: string
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const ring = ringColor(player.id)
  return (
    <span className={clsx("flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-surface-2)] font-display", sizes[size], className)}
      style={{ boxShadow: `0 0 0 2px var(--color-surface), 0 0 0 3.5px ${ring}`, color: ring }}>
      {player.photoUrl && failedUrl !== player.photoUrl ? (
        <img src={player.photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setFailedUrl(player.photoUrl ?? null)} />
      ) : initials(player)}
    </span>
  )
}
