import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "@/styles/globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { CookieNotice } from "@/components/layout/CookieNotice";
import { PrelaunchBanner } from "@/components/layout/PrelaunchBanner";
import { InstallApp } from "@/components/layout/InstallApp";
import { PageWaves } from "@/components/layout/WaveBackground";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: { default: "ServerSentry — Know Who You're Playing With", template: "%s · ServerSentry" },
  description: "The community-powered gaming reputation network. Discover player reputations, recognise great teammates and help build better gaming communities.",
  robots: { index: true, follow: true },
  applicationName: "ServerSentry",
  appleWebApp: { capable: true, title: "ServerSentry", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#08070D", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-violet-brand focus:px-4 focus:py-2">Skip to content</a>
        <CookieNotice />
        <PageWaves />
        <div className="relative z-[1]">
          <PrelaunchBanner />
          <Navbar />
          <main id="main" className="relative">{children}</main>
          <Footer />
        </div>
        <InstallApp />
      </body>
    </html>
  );
}
