export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="ss-iris" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="0.35" stopColor="#a855f7" />
          <stop offset="0.65" stopColor="#6366f1" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <path d="M20 2.5 34.5 8v10.6c0 9-6.1 16.1-14.5 18.9C11.6 34.7 5.5 27.6 5.5 18.6V8L20 2.5Z" fill="none" stroke="url(#ss-iris)" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M11 20.5c3-3.2 6-3.2 9 0s6 3.2 9 0" fill="none" stroke="url(#ss-iris)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M11 14.5c3-3.2 6-3.2 9 0s6 3.2 9 0" fill="none" stroke="url(#ss-iris)" strokeWidth="2" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-[1.05rem] font-semibold tracking-tight">
        Server<span className="iris-text">Sentry</span>
      </span>
    </span>
  );
}
