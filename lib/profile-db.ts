import { drizzle } from "drizzle-orm/node-postgres"
import { integer, pgTable, text } from "drizzle-orm/pg-core"
import { Pool } from "pg"

const globalDb = globalThis as unknown as { profilePool?: Pool }
const pool = globalDb.profilePool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
if (process.env.NODE_ENV !== "production") globalDb.profilePool = pool

export const profileDb = drizzle(pool)
export const profilePlayers = pgTable("players", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  lastName: text("last_name"),
  handicap: integer("handicap").notNull(),
  nickname: text("nickname"),
  email: text("email"),
  photoPath: text("photo_path"),
  photoVersion: text("photo_version"),
})

export const publicPlayerFields = {
  id: profilePlayers.id,
  name: profilePlayers.name,
  last_name: profilePlayers.lastName,
  handicap: profilePlayers.handicap,
  nickname: profilePlayers.nickname,
  photo_version: profilePlayers.photoVersion,
  has_photo: profilePlayers.photoPath,
}

export function avatarUrl(id: number, version: string | null, hasPhoto: boolean) {
  return hasPhoto ? `/api/player-photo/${id}?v=${encodeURIComponent(version ?? "")}` : null
}
