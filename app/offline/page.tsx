import Link from "next/link"

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-lg">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">Offline mode</p>
        <h1 className="text-balance text-2xl font-bold text-[var(--color-foreground)]">Your connection is unavailable</h1>
        <p className="mt-3 leading-6 text-[var(--color-muted)]">Cached scorecards remain available. Any supported changes will stay on this device and sync automatically when you reconnect.</p>
        <Link href="/" className="mt-6 inline-flex rounded-full bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-[var(--color-primary-foreground)]">Return to Stonebrae Match</Link>
      </section>
    </main>
  )
}
