"use client";
import { useEffect, useRef } from "react";

/**
 * Flowing iridescent waves that travel across the page (canvas).
 * - "hero": larger, brighter ribbons behind the landing hero.
 * - "page": faint full-page layer behind all content.
 * Motion is on by default unless the OS asks for reduced motion; the footer toggle (localStorage "ss_motion") overrides.
 * Throttled to ~30fps, paused in background tabs, DPR capped for performance.
 */
const COLORS = ["#8b5cf6", "#d946ef", "#6366f1", "#22d3ee", "#f472b6", "#a855f7"];

export function motionAllowed(): boolean {
  try {
    const pref = localStorage.getItem("ss_motion");
    if (pref === "on") return true;
    if (pref === "off") return false;
  } catch { /* storage blocked */ }
  return !matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function WaveCanvas({ variant = "hero" }: { variant?: "hero" | "page" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const page = variant === "page";
    const dpr = Math.min(window.devicePixelRatio || 1, page ? 1.25 : 1.75);
    let w = 0, h = 0, raf = 0, last = 0, running = motionAllowed();
    const t0 = performance.now() - 40000; // start mid-flow so the first frame already looks alive
    const size = () => { w = cv.clientWidth; h = cv.clientHeight; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    // Each ribbon: vertical position (0-1), amplitude (px), wavelength (px), speed (px/s), thickness, alpha
    const ribbons = page
      ? [[0.18, 80, 900, 40, 1.8, 0.36], [0.42, 100, 1200, -28, 1.4, 0.28], [0.66, 90, 1000, 34, 1.6, 0.3], [0.88, 70, 800, -24, 1.3, 0.24]]
      : [[0.30, 110, 1100, 70, 2.6, 0.75], [0.40, 140, 1400, -50, 1.8, 0.55], [0.50, 95, 900, 90, 2.2, 0.6], [0.60, 125, 1250, -65, 1.4, 0.45], [0.46, 60, 700, 120, 1, 0.35]];
    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      if (!page) {
        // ambient purple glow that slowly drifts
        const gx = w * (0.25 + 0.08 * Math.sin(t / 9)), gy = h * (0.15 + 0.05 * Math.cos(t / 11));
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h) * 0.6);
        g.addColorStop(0, "rgba(139,92,246,0.32)"); g.addColorStop(1, "rgba(139,92,246,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        const g2x = w * (0.8 - 0.06 * Math.sin(t / 13));
        const g2 = ctx.createRadialGradient(g2x, h * 0.25, 0, g2x, h * 0.25, Math.max(w, h) * 0.45);
        g2.addColorStop(0, "rgba(217,70,239,0.2)"); g2.addColorStop(1, "rgba(217,70,239,0)");
        ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h);
      }
      ribbons.forEach(([yy, amp, len, speed, thick, alpha], i) => {
        const shift = (t * 0.05 + i * 0.17) % 1; // colours flow along the ribbon
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        COLORS.forEach((c, k) => grad.addColorStop(((k / COLORS.length) + shift) % 1, c));
        const k = (Math.PI * 2) / len, phase = speed * t * k; // travelling wave: moves horizontally across the page
        const yAt = (x: number) => h * yy + Math.sin(x * k - phase + i) * amp + Math.sin(x * k * 2.3 + phase * 0.6 + i * 2) * amp * 0.25;
        // soft band under each ribbon for a flowing, silky look
        ctx.beginPath();
        for (let x = -20; x <= w + 20; x += 12) { const y = yAt(x); x <= -20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        for (let x = w + 20; x >= -20; x -= 12) ctx.lineTo(x, yAt(x) + amp * 0.35);
        ctx.closePath(); ctx.globalAlpha = alpha * 0.18; ctx.fillStyle = grad; ctx.fill();
        // the ribbon line itself
        ctx.beginPath();
        for (let x = -20; x <= w + 20; x += 8) { const y = yAt(x); x <= -20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.globalAlpha = alpha; ctx.strokeStyle = grad; ctx.lineWidth = thick; ctx.stroke();
        ctx.globalAlpha = 1;
      });
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return; // ~30fps is plenty for ambient motion
      last = now; draw(now);
    };
    const start = () => { cancelAnimationFrame(raf); if (running && !document.hidden) raf = requestAnimationFrame(loop); else draw(performance.now()); };
    const onVis = () => start();
    const onToggle = () => { running = motionAllowed(); start(); };
    const ro = new ResizeObserver(() => { size(); draw(performance.now()); });
    size(); ro.observe(cv); start();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("ss-motion-change", onToggle);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("ss-motion-change", onToggle); };
  }, [variant]);
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}

export function MotionToggle() {
  const toggle = () => {
    const next = motionAllowed() ? "off" : "on";
    try { localStorage.setItem("ss_motion", next); } catch { /* ignore */ }
    window.dispatchEvent(new Event("ss-motion-change"));
    const el = document.getElementById("ss-motion-state"); if (el) el.textContent = next === "on" ? "On" : "Off";
  };
  return (
    <button type="button" onClick={toggle} className="rounded-lg border border-ink-line px-3 py-1.5 text-xs text-text-muted hover:text-text">
      Background animation: <span id="ss-motion-state" suppressHydrationWarning>{typeof window !== "undefined" && !motionAllowed() ? "Off" : "On"}</span>
    </button>
  );
}
