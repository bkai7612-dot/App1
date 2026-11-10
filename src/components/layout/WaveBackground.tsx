import { WaveCanvas } from "./WaveCanvas";

/** Hero / section background: travelling iridescent waves with a fade into the page. */
export function WaveBackground({ intensity = "full" }: { intensity?: "full" | "soft" }) {
  return (
    <div className="wave-field" aria-hidden="true" style={intensity === "soft" ? { opacity: 0.7 } : undefined}>
      <WaveCanvas variant="hero" />
    </div>
  );
}

/** Faint full-page wave layer fixed behind all content. */
export function PageWaves() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 opacity-80">
      <WaveCanvas variant="page" />
    </div>
  );
}
