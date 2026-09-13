"use server"

import { and, eq, isNull } from "drizzle-orm"
import { del, put } from "@vercel/blob"
import sharp from "sharp"
import { revalidatePath } from "next/cache"
import { getCurrentPlayerId } from "@/lib/session"
import { avatarUrl, profileDb, profilePlayers } from "@/lib/profile-db"

export type MyProfile = {
  id: number
  nickname: string
  email: string
  photoUrl: string | null
  version: string
}

export async function getMyProfile(): Promise<MyProfile> {
  const id = await getCurrentPlayerId()
  if (!id) throw new Error("Select your name before opening profile settings.")
  const [player] = await profileDb.select().from(profilePlayers).where(eq(profilePlayers.id, id)).limit(1)
  if (!player) throw new Error("This player no longer exists. Please select your name again.")
  return {
    id,
    nickname: player.nickname ?? "",
    email: player.email ?? "",
    photoUrl: avatarUrl(id, player.photoVersion, !!player.photoPath),
    version: player.photoVersion ?? "",
  }
}

async function discardPhoto(path: string | null) {
  if (!path) return
  try {
    await del(path)
  } catch {
    console.warn("Profile photo cleanup could not be completed.")
  }
}

export async function saveMyProfile(form: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = await getCurrentPlayerId()
  if (!id || String(id) !== form.get("expectedPlayer")) {
    return { ok: false, error: "Your selected player changed. Reopen profile settings and try again." }
  }
  const nicknameValue = form.get("nickname")
  const emailValue = form.get("email")
  const version = form.get("version")
  if (typeof nicknameValue !== "string" || typeof emailValue !== "string" || typeof version !== "string") {
    return { ok: false, error: "Invalid profile details." }
  }
  const nickname = nicknameValue.trim()
  const email = emailValue.trim()
  if (nickname.length > 20 || /[\u0000-\u001f\u007f]/.test(nickname)) {
    return { ok: false, error: "Username must be 20 characters or fewer, without control characters." }
  }
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return { ok: false, error: "Enter a valid email address, or leave it blank." }
  }
  const file = form.get("photo")
  const removePhoto = form.get("removePhoto") === "true"
  let image: Buffer | null = null
  if (file instanceof File && file.size > 0) {
    if (file.size > 3 * 1024 * 1024) return { ok: false, error: "Choose a photo smaller than 3 MB." }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return { ok: false, error: "Choose a JPEG, PNG, or WebP photo." }
    }
    try {
      const input = Buffer.from(await file.arrayBuffer())
      const metadata = await sharp(input, { limitInputPixels: 40_000_000 }).metadata()
      if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("Unsupported image")
      image = await sharp(input, { limitInputPixels: 40_000_000 })
        .rotate().resize(512, 512, { fit: "cover" }).webp({ quality: 85 }).toBuffer()
    } catch {
      return { ok: false, error: "This photo could not be read. Try a different JPEG, PNG, or WebP image." }
    }
  }

  let uploadedPath: string | null = null
  try {
    const [player] = await profileDb.select({ photoPath: profilePlayers.photoPath, version: profilePlayers.photoVersion })
      .from(profilePlayers).where(eq(profilePlayers.id, id)).limit(1)
    if (!player) return { ok: false, error: "Player not found. Please select your name again." }
    if ((player.version ?? "") !== version) return { ok: false, error: "Your profile changed elsewhere. Close and reopen settings to load the latest version." }

    if (image) {
      const blob = await put(`profile-photos/${id}/${crypto.randomUUID()}.webp`, image, {
        access: "private", contentType: "image/webp", addRandomSuffix: true,
      })
      uploadedPath = blob.pathname
    }
    const nextPath = uploadedPath ?? (removePhoto ? null : player.photoPath)
    const updated = await profileDb.update(profilePlayers).set({
      nickname: nickname || null, email: email || null,
      photoPath: nextPath, photoVersion: crypto.randomUUID(),
    }).where(and(eq(profilePlayers.id, id), player.version === null
      ? isNull(profilePlayers.photoVersion) : eq(profilePlayers.photoVersion, player.version)))
      .returning({ id: profilePlayers.id })
    if (!updated.length) {
      await discardPhoto(uploadedPath)
      return { ok: false, error: "Your profile changed elsewhere. Reopen settings and try again." }
    }
    if (player.photoPath && nextPath !== player.photoPath) await discardPhoto(player.photoPath)
  } catch {
    await discardPhoto(uploadedPath)
    return { ok: false, error: "Your changes could not be saved. Please try again." }
  }
  revalidatePath("/", "layout")
  return { ok: true }
}
