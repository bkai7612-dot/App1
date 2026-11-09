import Link from "next/link";
export default function NotFound() {
  return <div className="mx-auto max-w-md px-4 py-24 text-center"><p className="font-display text-6xl font-semibold iris-text">404</p><p className="mt-4 text-text-muted">We couldn&apos;t find that page.</p><Link href="/" className="btn-ghost mt-6">Go home</Link></div>;
}
