"use client"

import { useEffect, useRef } from "react"

const SPRITES = [{ src: "/space-golf/golfball.png", weight: 1 }]

type Particle = {
  img: HTMLImageElement
  /** depth 0..1 — smaller = farther away (smaller, slower, dimmer) */
  depth: number
  x: number
  y: number
  size: number
  vx: number
  vy: number
  rot: number
  vrot: number
  baseAlpha: number
  twinklePhase: number
  twinkleSpeed: number
}

/**
 * A slow-drifting "galaxy" of golf balls and tees rendered to a single canvas.
 * Parallax depth layers + faint nebula glows evoke stars and galaxies moving slowly.
 * Sits fixed behind all app content and never intercepts pointer events.
 */
export function SpaceGolfBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    let width = 0
    let height = 0
    let dpr = 1
    let particles: Particle[] = []
    let raf = 0
    let last = performance.now()
    let running = true

    // Load sprites, expanded by weight so common ones appear more often.
    const pool: HTMLImageElement[] = []
    let loaded = 0
    const imgs = SPRITES.map(({ src, weight }) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.src = src
      img.onload = () => {
        for (let i = 0; i < weight; i++) pool.push(img)
        loaded++
        if (loaded === SPRITES.length) build()
      }
      return img
    })

    function rand(min: number, max: number) {
      return min + Math.random() * (max - min)
    }

    function makeParticle(seedY?: number): Particle {
      const img = pool[Math.floor(Math.random() * pool.length)]
      const depth = Math.random() // 0 far → 1 near
      const size = rand(14, 30) + depth * depth * 64
      const speed = (0.06 + depth * 0.5) * (reduceMotion ? 0 : 1)
      const angle = rand(0, Math.PI * 2)
      return {
        img,
        depth,
        x: rand(0, width),
        y: seedY ?? rand(0, height),
        size,
        vx: Math.cos(angle) * speed * rand(0.3, 1),
        vy: Math.sin(angle) * speed * rand(0.3, 1),
        rot: rand(0, Math.PI * 2),
        vrot: (reduceMotion ? 0 : 1) * rand(-0.15, 0.15) * (0.2 + depth),
        baseAlpha: 0.28 + depth * 0.6,
        twinklePhase: rand(0, Math.PI * 2),
        twinkleSpeed: rand(0.3, 1.1),
      }
    }

    function build() {
      const area = width * height
      const count = Math.max(24, Math.min(80, Math.round(area / 22000)))
      particles = Array.from({ length: count }, () => makeParticle())
      particles.sort((a, b) => a.depth - b.depth) // far first for correct layering
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = width + "px"
      canvas.style.height = height + "px"
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (pool.length && !particles.length) build()
    }

    // Slow-drifting nebula glows for depth behind the "stars".
    const nebulae = [
      { hue: "rgba(48, 224, 127, 0.10)", x: 0.2, y: 0.25, r: 0.55, dx: 0.004, dy: 0.003 },
      { hue: "rgba(255, 207, 63, 0.08)", x: 0.8, y: 0.7, r: 0.6, dx: -0.003, dy: 0.0035 },
      { hue: "rgba(96, 165, 250, 0.07)", x: 0.6, y: 0.15, r: 0.5, dx: 0.0025, dy: -0.002 },
    ]
    let t = 0

    function drawNebulae() {
      for (const n of nebulae) {
        const cx = (n.x + Math.sin(t * n.dx) * 0.05) * width
        const cy = (n.y + Math.cos(t * n.dy) * 0.05) * height
        const radius = n.r * Math.max(width, height)
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
        g.addColorStop(0, n.hue)
        g.addColorStop(1, "rgba(0,0,0,0)")
        ctx.fillStyle = g
        ctx.fillRect(0, 0, width, height)
      }
    }

    function frame(now: number) {
      if (!running) return
      const dt = Math.min(now - last, 60)
      last = now
      t += dt

      ctx.clearRect(0, 0, width, height)
      drawNebulae()

      const margin = 120
      for (const p of particles) {
        if (!reduceMotion) {
          p.x += p.vx * dt * 0.06
          p.y += p.vy * dt * 0.06
          p.rot += p.vrot * dt * 0.001
          p.twinklePhase += p.twinkleSpeed * dt * 0.0006
        }

        // wrap around edges for an endless field
        if (p.x < -margin) p.x = width + margin
        else if (p.x > width + margin) p.x = -margin
        if (p.y < -margin) p.y = height + margin
        else if (p.y > height + margin) p.y = -margin

        const twinkle = reduceMotion ? 1 : 0.75 + Math.sin(p.twinklePhase) * 0.25
        const alpha = Math.max(0, Math.min(1, p.baseAlpha * twinkle))

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.globalAlpha = alpha
        // subtle glow for the nearer, brighter objects
        if (p.depth > 0.55) {
          ctx.shadowColor = "rgba(255,255,255,0.35)"
          ctx.shadowBlur = p.size * 0.4
        }
        const s = p.size
        ctx.drawImage(p.img, -s / 2, -s / 2, s, s)
        ctx.restore()
      }

      raf = requestAnimationFrame(frame)
    }

    resize()
    window.addEventListener("resize", resize)

    const onVisibility = () => {
      running = document.visibilityState === "visible"
      if (running) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      } else {
        cancelAnimationFrame(raf)
      }
    }
    document.addEventListener("visibilitychange", onVisibility)

    raf = requestAnimationFrame(frame)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
      document.removeEventListener("visibilitychange", onVisibility)
      imgs.forEach((img) => {
        img.onload = null
      })
    }
  }, [])

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  )
}
