import { clsx } from "clsx"
import Link from "next/link"
import type { ComponentProps } from "react"

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={clsx("liquid-glass rounded-[var(--radius)]", className)}
      {...props}
    />
  )
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-tight transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)] disabled:opacity-40 disabled:pointer-events-none"

const variants = {
  primary: "liquid-glass-tint [--tint:var(--color-primary)] text-[var(--color-primary-foreground)]",
  outline: "liquid-glass-item text-[var(--color-foreground)]",
  ghost: "bg-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-2)]",
  danger: "liquid-glass-tint [--tint:var(--color-danger)] text-white",
  gold: "liquid-glass-tint [--tint:var(--color-gold)] text-[#1a1204]",
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
        "liquid-glass-item inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
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
