import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { MotionConfig } from "motion/react";
import { GlobalModalProvider } from "@/components/modals/global-modal-provider";
import { AppStateProvider } from "@/components/providers/app-state-provider";
import { RoutePrefetcher } from "@/components/shell/route-prefetcher";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bendline — Journeyman Plumber Licensing Prep",
  description:
    "Offline-capable PWA for journeyman plumber licensing exam prep with jurisdiction-specific code drills and an isometric pipe-drawing lab.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Bendline",
  },
};

export const viewport: Viewport = {
  themeColor: "rgb(5, 5, 5)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" className={`${inter.variable} dark`}>
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
