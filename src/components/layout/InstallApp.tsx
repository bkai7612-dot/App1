"use client";
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** One-click "Install app" (Chrome/Edge/Android); simple instructions on iPhone/iPad. Hidden once installed. */
export function InstallApp() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    let dismissed = false;
    try { dismissed = localStorage.getItem("ss_install_dismissed") === "1"; } catch { /* storage blocked */ }
    if (standalone || dismissed) return;
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); setHidden(false); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) { setIos(true); setHidden(false); }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (hidden) return null;
  const dismiss = () => { setHidden(true); try { localStorage.setItem("ss_install_dismissed", "1"); } catch { /* ignore */ } };
  return (
    <div className="fixed bottom-20 right-3 z-[65] max-w-xs sm:bottom-6">
      <div className="glass flex items-center gap-3 p-3 text-sm">
        <Download className="h-5 w-5 shrink-0 text-violet-lavender" aria-hidden="true" />
        {ios ? <span className="text-text-muted">Install: tap <b className="text-text">Share</b>, then <b className="text-text">Add to Home Screen</b>.</span> : (
          <button className="btn-primary px-3 py-1.5 text-xs" onClick={async () => { await evt?.prompt(); dismiss(); }}>Install ServerSentry app</button>
        )}
        <button onClick={dismiss} aria-label="Dismiss" className="rounded p-1 text-text-muted hover:text-text"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
