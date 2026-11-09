"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  // Generic message only: details stay in server logs.
  return <div className="mx-auto max-w-md px-4 py-24 text-center"><h1 className="font-display text-2xl font-semibold">Something went wrong</h1><p className="mt-3 text-text-muted">Please try again. If it keeps happening, contact support.</p><button onClick={reset} className="btn-ghost mt-6">Try again</button></div>;
}
