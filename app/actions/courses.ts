"use server"

import { generateText, Output } from "ai"
import { z } from "zod"
import { sql } from "@/lib/db"
import { COURSE, STONEBRAE_ID, type Hole, type SavedCourse } from "@/lib/course"
import { getCurrentPlayerId } from "@/lib/session"
import { revalidatePath } from "next/cache"

const MAX_IMAGE_BYTES = 3_500_000

const scorecardSchema = z.object({
  holes: z
    .array(
      z.object({
        hole: z.number().int().describe("Hole number, 1 through 18"),
        par: z.number().int().describe("Par for the hole, from the row labeled Par"),
        hcp: z
          .number()
          .int()
          .describe("Stroke index from the row labeled Handicap, HCP, HDCP, or S.I. (1 = hardest hole)"),
        yards: z.number().int().nullable().describe("Yardage from the longest/back tee row if readable, otherwise null"),
      }),
    )
    .describe("Exactly 18 holes in order, 1 through 18. Skip the Out/In/Total summary columns."),
})

function validateHoles(holes: Hole[]): string | null {
  if (holes.length !== 18) return `Found ${holes.length} holes — a course needs 18.`
  for (const h of holes) {
    if (!Number.isInteger(h.par) || h.par < 3 || h.par > 6) return `Hole ${h.hole} has an invalid par (${h.par}).`
    if (!Number.isInteger(h.hcp) || h.hcp < 1 || h.hcp > 18) return `Hole ${h.hole} has an invalid handicap (${h.hcp}).`
  }
  const hcps = new Set(holes.map((h) => h.hcp))
  if (hcps.size !== 18) return "Each handicap number 1–18 must appear exactly once."
  return null
}

function normalizeHoles(raw: { hole: number; par: number; hcp: number; yards?: number | null }[]): Hole[] {
  return raw
    .slice()
    .sort((a, b) => a.hole - b.hole)
    .slice(0, 18)
    .map((h, i) => ({
      hole: i + 1,
      par: Math.round(Number(h.par)),
      hcp: Math.round(Number(h.hcp)),
      yards: Math.max(0, Math.round(Number(h.yards ?? 0))),
    }))
}

export async function scanScorecard(input: {
  imageDataUrl: string
}): Promise<{ ok: true; holes: Hole[]; warning: string | null } | { ok: false; error: string }> {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(input.imageDataUrl)
  if (!match) return { ok: false, error: "That file isn't a supported image." }
  const [, mediaType, base64] = match
  if (base64.length * 0.75 > MAX_IMAGE_BYTES) return { ok: false, error: "Image is too large. Try a smaller photo." }

  try {
    const { output } = await generateText({
      model: "google/gemini-3.5-flash",
      output: Output.object({ schema: scorecardSchema }),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "This is a photo of a golf course scorecard. Read it row by row.",
                "Find the row labeled Par and the row labeled Handicap (also HCP, HDCP, Hdcp, or S.I.).",
                "If there are separate men's and ladies' handicap rows, use the men's row.",
                "Return all 18 holes in order with the par and handicap for each hole. Ignore Out, In, and Total columns.",
                "Handicaps across 18 holes are normally each number 1–18 exactly once.",
              ].join(" "),
            },
            { type: "file", mediaType, data: base64 },
          ],
        },
      ],
    })

    const holes = normalizeHoles(output.holes)
    return { ok: true, holes, warning: validateHoles(holes) }
  } catch (err) {
    console.error("[v0] scanScorecard failed:", err)
    return { ok: false, error: "Couldn't read that scorecard. Try a clearer, straight-on photo." }
  }
}

export async function saveCourse(input: {
  name: string
  holes: Hole[]
}): Promise<{ ok: true; course: SavedCourse } | { ok: false; error: string }> {
  const name = input.name.trim().slice(0, 80)
  if (!name) return { ok: false, error: "Give the course a name." }
  const holes = normalizeHoles(input.holes)
  const invalid = validateHoles(holes)
  if (invalid) return { ok: false, error: invalid }

  const createdBy = await getCurrentPlayerId()
  const rows = await sql`
    INSERT INTO courses (name, holes, created_by)
    VALUES (${name}, ${JSON.stringify(holes)}, ${createdBy})
    RETURNING id`
  revalidatePath("/new")
  return { ok: true, course: { id: String(rows[0].id), name, holes, builtIn: false } }
}

export async function getCourses(): Promise<SavedCourse[]> {
  const rows = await sql`SELECT id, name, holes FROM courses ORDER BY created_at DESC`
  return [
    { id: STONEBRAE_ID, name: COURSE.name, holes: COURSE.holes, builtIn: true },
    ...rows.map((r: any) => ({ id: String(r.id), name: r.name, holes: r.holes as Hole[], builtIn: false })),
  ]
}

export async function getCourseHoles(courseId: string | undefined): Promise<{ name: string; holes: Hole[] }> {
  if (!courseId || courseId === STONEBRAE_ID) return COURSE
  const id = Number(courseId)
  if (!Number.isInteger(id)) return COURSE
  const rows = await sql`SELECT name, holes FROM courses WHERE id = ${id}`
  if (!rows[0]) return COURSE
  return { name: rows[0].name, holes: rows[0].holes as Hole[] }
}
