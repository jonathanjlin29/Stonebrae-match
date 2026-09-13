import { clsx } from "clsx"
import Link from "next/link"
import type { ComponentProps } from "react"

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={clsx("card-shadow rounded-[var(--radius)] bg-[var(--color-surface)]", className)}
      {...props}
    />
  )
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-tight transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)] disabled:opacity-40 disabled:pointer-events-none"

const variants = {
  primary: "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-[0_8px_20px_-6px_hsl(150_70%_40%/0.5)] hover:brightness-105",
  outline:
    "bg-[var(--color-surface-2)] text-[var(--color-foreground)] hover:bg-[var(--color-border)]",
  ghost: "bg-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-2)]",
  danger: "bg-[var(--color-danger)] text-white shadow-[0_8px_20px_-6px_hsl(6_90%_55%/0.5)] hover:brightness-105",
  gold: "bg-[var(--color-gold)] text-[#1a1204] shadow-[0_8px_20px_-6px_hsl(45_90%_50%/0.5)] hover:brightness-105",
}

const sizes = {
  sm: "h-9 px-4 text-sm",
  md: "h-12 px-6 text-sm",
  lg: "h-14 px-7 text-base",
}

type BtnProps = {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ComponentProps<"button"> & BtnProps) {
  return <button className={clsx(buttonBase, variants[variant], sizes[size], className)} {...props} />
}

export function LinkButton({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ComponentProps<typeof Link> & BtnProps) {
  return <Link className={clsx(buttonBase, variants[variant], sizes[size], className)} {...props} />
}

export { PlayerAvatar } from "./player-avatar"

export function Badge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full bg-[var(--color-surface-2)] px-3 py-1 text-xs font-semibold",
        className,
      )}
      {...props}
    />
  )
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  className?: string
}) {
  return (
    <div className={clsx("segmented inline-flex", className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={clsx(
            "h-9 min-w-[3.5rem] rounded-[calc(var(--radius)-9px)] px-4 text-sm font-semibold transition-all",
            value === opt.value
              ? "segmented-thumb text-[var(--color-foreground)]"
              : "text-[var(--color-muted)] hover:text-[var(--color-foreground)]",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
