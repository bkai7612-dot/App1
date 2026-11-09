"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-label={title}
      className="glass m-auto w-[min(32rem,calc(100vw-2rem))] p-0 text-text backdrop:bg-black/70 backdrop:backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-ink-line px-5 py-4">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <button onClick={onClose} className="rounded-lg p-1.5 text-text-muted hover:bg-white/5" aria-label="Close"><X className="h-5 w-5" /></button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
    </dialog>
  );
}
