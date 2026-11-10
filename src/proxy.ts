import { NextResponse, type NextRequest } from "next/server";

/**
 * Network-boundary proxy: per-request CSP nonce. (Auth/authorisation is enforced in route
 * handlers and server components, never solely here.)
 */
let appUrlChecked = false;

export function proxy(request: NextRequest) {
  if (!appUrlChecked) {
    appUrlChecked = true;
    const configured = process.env.APP_URL;
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    try {
      if (configured && host && new URL(configured).host !== host)
        console.warn(`[config] APP_URL (${configured}) does not match the host being served (${host}). Sign-in callbacks (Steam, Discord, Battle.net) and passkeys will fail. Set APP_URL to the public address.`);
    } catch { console.warn("[config] APP_URL is not a valid URL"); }
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com https://steamcommunity.com",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
