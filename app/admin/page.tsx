import { getIsAdmin } from "@/lib/session"
import { getCurrentPlayer, getPlayers } from "@/app/actions/players"
import { SiteHeader } from "@/components/site-header"
import { AdminLoginForm } from "@/components/admin-login-form"
import { AdminPlayersPanel } from "@/components/admin-players-panel"

export const revalidate = 0

export default async function AdminPage() {
  const [isAdmin, currentPlayer] = await Promise.all([getIsAdmin(), getCurrentPlayer()])
  const players = isAdmin ? await getPlayers() : []

  return (
    <div className="min-h-dvh">
      <SiteHeader player={currentPlayer} />
      {isAdmin ? <AdminPlayersPanel players={players} /> : <AdminLoginForm />}
    </div>
  )
}
