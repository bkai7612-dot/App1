/** Flowing iridescent wave field (pure CSS/SVG; motion disabled under prefers-reduced-motion). */
export function WaveBackground({ intensity = "full" }: { intensity?: "full" | "soft" }) {
  return (
    <div className="wave-field" aria-hidden="true">
      <div className="blob b1" />
      <div className="blob b2" />
      {intensity === "full" && <div className="blob b3" />}
      <svg className="wave-1" style={{ top: "18%" }} viewBox="0 0 2880 400" preserveAspectRatio="none">
        <defs>
          <linearGradient id="wg1" x1="0" x2="1">
            <stop offset="0" stopColor="#8b5cf6" stopOpacity="0" />
            <stop offset=".2" stopColor="#a855f7" />
            <stop offset=".45" stopColor="#d946ef" />
            <stop offset=".7" stopColor="#6366f1" />
            <stop offset=".9" stopColor="#22d3ee" />
            <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 200 C 240 80, 480 320, 720 200 S 1200 80, 1440 200 S 1920 320, 2160 200 S 2640 80, 2880 200" fill="none" stroke="url(#wg1)" strokeWidth="2" />
        <path d="M0 230 C 240 110, 480 350, 720 230 S 1200 110, 1440 230 S 1920 350, 2160 230 S 2640 110, 2880 230" fill="none" stroke="url(#wg1)" strokeWidth="1" opacity=".6" />
      </svg>
      <svg className="wave-2" style={{ top: "30%" }} viewBox="0 0 2880 400" preserveAspectRatio="none">
        <path d="M0 220 C 360 120, 720 320, 1080 220 S 1800 120, 2160 220 S 2880 320, 2880 220" fill="none" stroke="url(#wg1)" strokeWidth="1.5" />
        <path d="M0 260 C 360 160, 720 360, 1080 260 S 1800 160, 2160 260 S 2880 360, 2880 260" fill="none" stroke="url(#wg1)" strokeWidth="1" opacity=".5" />
      </svg>
      {intensity === "full" && (
        <svg className="wave-3" style={{ top: "42%" }} viewBox="0 0 2880 400" preserveAspectRatio="none">
          <path d="M0 200 C 480 300, 960 100, 1440 200 S 2400 300, 2880 200" fill="none" stroke="url(#wg1)" strokeWidth="1" />
        </svg>
      )}
    </div>
  );
}
