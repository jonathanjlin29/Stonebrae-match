import type { Metadata, Viewport } from "next"
import { Bebas_Neue, DM_Sans } from "next/font/google"
import "./globals.css"

const display = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
})

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
})

export const metadata: Metadata = {
  title: "Stonebrae Match — Nassau Golf Betting",
  description:
    "Track 18-hole Nassau matches, presses, and money at Stonebrae. Live leaderboard, personal analytics, bounce-backs and fire-hot streaks.",
  generator: "v0.app",
}

export const viewport: Viewport = {
  themeColor: "#0a1628",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  )
}
