"use server"

import { sql } from "@/lib/db"
import { del, put } from "@vercel/blob"
import sharp from "sharp"
import { getCurrentPlayerId, setCurrentPlayerId, clearCurrentPlayer } from "@/lib/session"
import type { Player } from "@/lib/types"
import { revalidatePath } from "next/cache"
import { asc, eq } from "drizzle-orm"
import { avatarUrl, profileDb, profilePlayers, publicPlayerFields } from "@/lib/profile-db"

function mapPlayer(row: any): Player {
  return {
    id: row.id,
    name: row.name,
    lastName: row.last_name,
    handicap: row.handicap,
    nickname: row.nickname ?? null,
    photoUrl: avatarUrl(row.id, row.photo_version ?? null, !!row.has_photo),
  }
}

export async function getPlayers(): Promise<Player[]> {
  const rows = await profileDb.select(publicPlayerFields).from(profilePlayers).orderBy(asc(profilePlayers.name), asc(profilePlayers.lastName))
  return rows.map(mapPlayer)
}

export async function getCurrentPlayer(): Promise<Player | null> {
  const id = await getCurrentPlayerId()
  if (!id) return null
  const rows = await profileDb.select(publicPlayerFields).from(profilePlayers).where(eq(profilePlayers.id, id)).limit(1)
  return rows[0] ? mapPlayer(rows[0]) : null
}

export async function getPlayerById(id: number): Promise<Player | null> {
  const rows = await profileDb.select(publicPlayerFields).from(profilePlayers).where(eq(profilePlayers.id, id)).limit(1)
  return rows[0] ? mapPlayer(rows[0]) : null
}

export async function createPlayer(input: {
  name: string
  lastName?: string
  handicap?: number
  nickname?: string
  photo?: File | null
}): Promise<{ ok: true; player: Player } | { ok: false; error: string; needsLastName?: boolean }> {
  const name = input.name.trim()
  const lastName = input.lastName?.trim() || null
  const nickname = input.nickname?.trim() || null
  const handicap = Number.isFinite(input.handicap) ? Math.round(input.handicap as number) : 0
  if (nickname && (nickname.length > 20 || /[\u0000-\u001f\u007f]/.test(nickname))) {
    return { ok: false, error: "Username must be 20 characters or fewer, without control characters." }
  }
  let image: Buffer | null = null
  if (input.photo && input.photo.size > 0) {
    if (input.photo.size > 3 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(input.photo.type)) {
      return { ok: false, error: "Choose a JPEG, PNG, or WebP photo smaller than 3 MB." }
    }
    try {
      const source = Buffer.from(await input.photo.arrayBuffer())
      const metadata = await sharp(source, { limitInputPixels: 40_000_000 }).metadata()
      if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("Unsupported image")
      image = await sharp(source, { limitInputPixels: 40_000_000 }).rotate().resize(512, 512, { fit: "cover" }).webp({ quality: 85 }).toBuffer()
    } catch {
      return { ok: false, error: "This photo could not be read. Try a different image." }
    }
  }

  if (!name) return { ok: false, error: "A name is required." }

  // Duplicate first-name detection: require a last name to disambiguate.
  const sameName =
    await sql`SELECT id, last_name FROM players WHERE lower(name) = lower(${name})`
  if (sameName.length > 0 && !lastName) {
    return {
      ok: false,
      error: `There's already a "${name}". Add a last name so people can tell you apart.`,
      needsLastName: true,
    }
  }
  if (lastName) {
    const exact =
      await sql`SELECT id FROM players WHERE lower(name) = lower(${name}) AND lower(coalesce(last_name,'')) = lower(${lastName})`
    if (exact.length > 0) {
      return { ok: false, error: "That exact name already exists — select them instead." }
    }
  }

  let uploadedPath: string | null = null
  try {
    const rows = await sql`INSERT INTO players (name, last_name, handicap, nickname) VALUES (${name}, ${lastName}, ${handicap}, ${nickname}) RETURNING id, name, last_name, handicap, nickname`
    const photoVersion = image ? crypto.randomUUID() : null
    if (image) {
      const blob = await put(`profile-photos/${rows[0].id}/${crypto.randomUUID()}.webp`, image, { access: "private", contentType: "image/webp", addRandomSuffix: true })
      uploadedPath = blob.pathname
      await sql`UPDATE players SET photo_path = ${uploadedPath}, photo_version = ${photoVersion} WHERE id = ${rows[0].id}`
    }
    const player = { ...rows[0], photo_version: photoVersion, has_photo: image ? uploadedPath : null }
    revalidatePath("/")
    return { ok: true, player: mapPlayer(player) }
  } catch {
    if (uploadedPath) await del(uploadedPath).catch(() => undefined)
    return { ok: false, error: "The player could not be created. Please try again." }
  }
}

export async function selectPlayer(id: number) {
  await setCurrentPlayerId(id)
  revalidatePath("/")
}

export async function signUpAndSelect(input: {
  name: string
  lastName?: string
  handicap?: number
  nickname?: string
  photo?: File | null
}) {
  const res = await createPlayer(input)
  if (res.ok) {
    await setCurrentPlayerId(res.player.id)
    revalidatePath("/")
  }
  return res
}

export async function signOut() {
  await clearCurrentPlayer()
  revalidatePath("/")
}

export async function updateHandicap(id: number, handicap: number) {
  await sql`UPDATE players SET handicap = ${Math.round(handicap)} WHERE id = ${id}`
  revalidatePath("/")
}

export async function updateNickname(nickname: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = await getCurrentPlayerId()
  if (!id) return { ok: false, error: "You need to be signed in to set a nickname." }

  const trimmed = nickname.trim()
  if (trimmed.length > 20) return { ok: false, error: "Nicknames can be at most 20 characters." }

  await sql`UPDATE players SET nickname = ${trimmed || null} WHERE id = ${id}`
  revalidatePath("/")
  revalidatePath("/leaderboard")
  revalidatePath(`/player/${id}`)
  return { ok: true }
}
