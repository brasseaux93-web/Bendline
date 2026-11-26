"use client";

import "./globals.css";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en" data-theme="dark" className="dark">
      <body className="bg-bg font-sans text-ink antialiased">
        <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-h1">Bendline hit a snag</h1>
          <p className="text-body text-ink-secondary">Reload to continue.</p>
          <button type="button" onClick={reset} className="btn-primary">Reload</button>
        </main>
      </body>
    </html>
  );
}
