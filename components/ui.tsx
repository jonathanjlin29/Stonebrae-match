import { clsx } from "clsx"
import Link from "next/link"
import type { ComponentProps } from "react"

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={clsx(
        "card-shadow rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)]",
        className,
      )}
      {...props}
    />
  )
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-semibold tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)] disabled:opacity-50 disabled:pointer-events-none"

const variants = {
  primary: "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:brightness-110",
  outline:
    "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] hover:bg-[var(--color-surface-2)]",
  ghost: "bg-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-2)]",
  danger: "bg-[var(--color-danger)] text-white hover:brightness-110",
  gold: "bg-[var(--color-gold)] text-[#1a1204] hover:brightness-110",
}

const sizes = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-14 px-6 text-base",
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

export function Badge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-0.5 text-xs font-medium",
        className,
      )}
      {...props}
    />
  )
}
