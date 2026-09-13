import { get } from "@vercel/blob"
import { eq } from "drizzle-orm"
import { getCurrentPlayerId } from "@/lib/session"
import { profileDb, profilePlayers } from "@/lib/profile-db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" }
  try {
    const viewerId = await getCurrentPlayerId()
    if (!viewerId) return new Response(null, { status: 401, headers })
    const [viewer] = await profileDb.select({ id: profilePlayers.id }).from(profilePlayers)
      .where(eq(profilePlayers.id, viewerId)).limit(1)
    if (!viewer) return new Response(null, { status: 401, headers })
    const id = Number((await params).id)
    if (!Number.isSafeInteger(id) || id < 1) return new Response(null, { status: 400, headers })
    const [player] = await profileDb.select({ path: profilePlayers.photoPath }).from(profilePlayers)
      .where(eq(profilePlayers.id, id)).limit(1)
    if (!player?.path) return new Response(null, { status: 404, headers })
    const result = await get(player.path, { access: "private", ifNoneMatch: request.headers.get("if-none-match") ?? undefined })
    if (!result) return new Response(null, { status: 404, headers })
    const imageHeaders = { "Cache-Control": "private, no-cache", Vary: "Cookie", ETag: result.blob.etag, "X-Content-Type-Options": "nosniff" }
    if (result.statusCode === 304) return new Response(null, { status: 304, headers: imageHeaders })
    return new Response(result.stream, { headers: { ...imageHeaders, "Content-Type": "image/webp" } })
  } catch {
    return new Response(null, { status: 503, headers })
  }
}
