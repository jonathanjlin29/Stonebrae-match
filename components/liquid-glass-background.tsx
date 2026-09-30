export function LiquidGlassBackground() {
  return (
    <div aria-hidden="true" className="liquid-bg pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="liquid-bg-field liquid-bg-field-a" />
      <div className="liquid-bg-field liquid-bg-field-b" />
      <div className="liquid-bg-field liquid-bg-field-c" />
      <div className="liquid-bg-sheen" />
    </div>
  )
}
