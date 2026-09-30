import { redirect } from "next/navigation"
import { getCurrentPlayer, getPlayers } from "../actions/players"
import { getCourses } from "../actions/courses"
import { NewRoundWizard } from "@/components/new-round-wizard"
import { SiteHeader } from "@/components/site-header"

export const dynamic = "force-dynamic"

export default async function NewRoundPage() {
  const player = await getCurrentPlayer()
  if (!player) redirect("/")
  const [players, courses] = await Promise.all([getPlayers(), getCourses()])

  return (
    <main className="min-h-dvh">
      <SiteHeader player={player} />
      <NewRoundWizard players={players} currentPlayer={player} courses={courses} />
    </main>
  )
}
