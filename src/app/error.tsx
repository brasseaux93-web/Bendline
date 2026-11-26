"use client";

import { useEffect } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-mark";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <BrandMark size={48} />
      <div className="space-y-2">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="text-h1 text-ink-primary">That page didn&apos;t load.</h1>
        <p className="text-body text-ink-secondary">Try again, or head back to the start.</p>
        {error.digest && <p className="font-mono text-caption text-ink-secondary">Ref: {error.digest}</p>}
      </div>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <button type="button" onClick={reset} className="btn-primary">Try again</button>
        <Link href="/" className="btn-secondary">Back to start</Link>
      </div>
    </main>
  );
}
