"use client"

import { useState, useTransition } from "react"
import { ArrowRight, Camera, Check, Flag, ImageIcon, Loader2, RotateCcw } from "lucide-react"
import { saveCourse, scanScorecard } from "@/app/actions/courses"
import type { Hole, SavedCourse } from "@/lib/course"
import { Button, Card } from "./ui"

type Mode = "pick" | "scan" | "review"

const MAX_DIMENSION = 1800

async function fileToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.crossOrigin = "anonymous"
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error("Could not load image"))
      img.src = url
    })
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/jpeg", 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function coursePar(holes: Hole[]) {
  return holes.reduce((s, h) => s + h.par, 0)
}

export function CourseStep({
  courses,
  selectedId,
  onSelect,
  onContinue,
}: {
  courses: SavedCourse[]
  selectedId: string
  onSelect: (course: SavedCourse) => void
  onContinue: () => void
}) {
  const [mode, setMode] = useState<Mode>("pick")
  const [list, setList] = useState(courses)
  const [name, setName] = useState("")
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [holes, setHoles] = useState<Hole[]>([])
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function pickPhoto(file: File | null) {
    setPhoto(file)
    setError(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(file ? URL.createObjectURL(file) : null)
  }

  function runScan() {
    if (!name.trim()) return setError("Add the golf course name.")
    if (!photo) return setError("Take or upload a picture of the scorecard.")
    setError(null)
    start(async () => {
      let dataUrl: string
      try {
        dataUrl = await fileToDataUrl(photo)
      } catch {
        setError("Couldn't open that image.")
        return
      }
      const res = await scanScorecard({ imageDataUrl: dataUrl })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setHoles(res.holes.length === 18 ? res.holes : padHoles(res.holes))
      setWarning(res.warning)
      setMode("review")
    })
  }

  function updateHole(i: number, key: "par" | "hcp", value: number) {
    setHoles((hs) => hs.map((h, idx) => (idx === i ? { ...h, [key]: value } : h)))
    setWarning(null)
  }

  function confirmCourse() {
    setError(null)
    start(async () => {
      const res = await saveCourse({ name, holes })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setList((l) => [l[0], res.course, ...l.slice(1)])
      onSelect(res.course)
      setMode("pick")
      setName("")
      pickPhoto(null)
      onContinue()
    })
  }

  if (mode === "scan") {
    return (
      <div>
        <h1 className="mb-1 font-display text-3xl tracking-tight sm:text-4xl">Scan a scorecard</h1>
        <p className="mb-6 text-sm text-[var(--color-muted)]">
          Snap the side with the Par and Handicap rows. Lay it flat with all 18 holes in frame.
        </p>

        <Card className="mb-4 flex flex-col gap-4 p-4 sm:p-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Course name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pebble Beach — Blue Tees"
              maxLength={80}
              className="h-11 rounded-full bg-[var(--color-surface-2)] px-4 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </label>

          {preview ? (
            <div className="flex flex-col gap-2">
              <img
                src={preview || "/placeholder.svg"}
                alt="Scorecard preview"
                className="max-h-72 w-full rounded-2xl bg-[var(--color-surface-2)] object-contain"
              />
              <button
                type="button"
                onClick={() => pickPhoto(null)}
                className="self-start text-sm font-medium text-[var(--color-muted)] underline-offset-4 hover:underline"
              >
                Choose a different photo
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl bg-[var(--color-surface-2)] p-5 text-sm font-medium transition-colors hover:bg-[var(--color-primary)]/10">
                <Camera className="h-6 w-6 text-[var(--color-primary)]" />
                Take photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
                />
              </label>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl bg-[var(--color-surface-2)] p-5 text-sm font-medium transition-colors hover:bg-[var(--color-primary)]/10">
                <ImageIcon className="h-6 w-6 text-[var(--color-primary)]" />
                Upload
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          )}
        </Card>

        {error && <p className="mb-3 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setMode("pick")} disabled={pending}>
            Cancel
          </Button>
          <Button size="lg" className="flex-1" onClick={runScan} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> Reading scorecard…
              </>
            ) : (
              <>
                Continue <ArrowRight className="h-5 w-5" />
              </>
            )}
          </Button>
        </div>
      </div>
    )
  }

  if (mode === "review") {
    return (
      <div>
        <h1 className="mb-1 font-display text-3xl tracking-tight sm:text-4xl">Check the holes</h1>
        <p className="mb-6 text-sm text-[var(--color-muted)]">
          {name} · Par {coursePar(holes)}. Tap any value to fix it before saving.
        </p>

        {[0, 9].map((start_) => (
          <Card key={start_} className="mb-4 overflow-x-auto p-0">
            <table className="w-full min-w-[34rem] text-center text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  <th className="px-3 py-2 text-left">Hole</th>
                  {holes.slice(start_, start_ + 9).map((h) => (
                    <th key={h.hole} className="px-1 py-2 tabular-nums">
                      {h.hole}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(["par", "hcp"] as const).map((key) => (
                  <tr key={key} className="border-t border-[var(--color-border)]">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                      {key === "par" ? "Par" : "HCP"}
                    </th>
                    {holes.slice(start_, start_ + 9).map((h, j) => (
                      <td key={h.hole} className="px-0.5 py-1.5">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={key === "par" ? 3 : 1}
                          max={key === "par" ? 6 : 18}
                          value={h[key] || ""}
                          onChange={(e) => updateHole(start_ + j, key, Number(e.target.value))}
                          aria-label={`Hole ${h.hole} ${key === "par" ? "par" : "handicap"}`}
                          className="h-9 w-10 rounded-lg bg-[var(--color-surface-2)] text-center font-display text-base tabular-nums outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}

        {warning && <p className="mb-3 text-sm text-[var(--color-gold)]">{warning}</p>}
        {error && <p className="mb-3 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setMode("scan")} disabled={pending}>
            <RotateCcw className="h-4 w-4" /> Rescan
          </Button>
          <Button size="lg" className="flex-1" onClick={confirmCourse} disabled={pending}>
            {pending ? "Saving…" : "Save course & continue"} <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-1 font-display text-3xl tracking-tight sm:text-4xl">Where are you playing?</h1>
      <p className="mb-6 text-sm text-[var(--color-muted)]">
        Pick a saved course or scan a new scorecard. Strokes are dotted using that course&apos;s handicaps.
      </p>

      <Card className="ios-list mb-4 overflow-hidden p-0">
        {list.map((c) => {
          const on = c.id === selectedId
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c)}
              aria-pressed={on}
              className={`flex w-full items-center gap-3 p-3.5 text-left transition-colors sm:px-5 ${on ? "bg-[var(--color-primary)]/[0.06]" : ""}`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  on
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "bg-[var(--color-surface-2)] text-transparent"
                }`}
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
              <Flag className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
              <span className="flex-1 truncate font-medium">{c.name}</span>
              <span className="text-xs font-semibold text-[var(--color-muted)]">Par {coursePar(c.holes)}</span>
            </button>
          )
        })}
      </Card>

      <Button variant="outline" className="mb-5 w-full" onClick={() => setMode("scan")}>
        <Camera className="h-4 w-4" /> Scan a new scorecard
      </Button>

      <Button size="lg" className="w-full" onClick={onContinue}>
        Next: pick players <ArrowRight className="h-5 w-5" />
      </Button>
    </div>
  )
}

function padHoles(holes: Hole[]): Hole[] {
  return Array.from({ length: 18 }, (_, i) => holes[i] ?? { hole: i + 1, par: 4, hcp: 0, yards: 0 })
}
