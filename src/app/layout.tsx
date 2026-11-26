import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { MotionConfig } from "motion/react";
import { GlobalModalProvider } from "@/components/modals/global-modal-provider";
import { AppStateProvider } from "@/components/providers/app-state-provider";
import { RoutePrefetcher } from "@/components/shell/route-prefetcher";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

const THEME_INIT =
  "try{var l=localStorage.getItem('bendline_theme_v1')==='light';var d=document.documentElement;d.dataset.theme=l?'light':'dark';d.classList.toggle('dark',!l)}catch(e){}";

const TITLE = "Bendline — Journeyman Plumber Licensing Prep";
const DESCRIPTION =
  "Offline-capable PWA for journeyman plumber licensing exam prep with jurisdiction-specific code drills and an isometric pipe-drawing lab.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000"),
  title: { default: TITLE, template: "%s · Bendline" },
  description: DESCRIPTION,
  manifest: "/manifest.webmanifest",
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: "Bendline", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Bendline" },
};

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050505" },
    { media: "(prefers-color-scheme: light)", color: "#F5F7FA" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${inter.variable} ${display.variable} ${mono.variable} dark`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="bg-bg font-sans text-ink tabular-nums antialiased">
        <MotionConfig reducedMotion="user">
          <AppStateProvider>
            <GlobalModalProvider>
              <RoutePrefetcher />
              {children}
            </GlobalModalProvider>
          </AppStateProvider>
        </MotionConfig>
      </body>
    </html>
  );
}
