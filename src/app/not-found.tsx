"use client";

import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-mark";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <BrandMark size={48} />
      <div className="space-y-2">
        <p className="eyebrow">404</p>
        <h1 className="text-h1 text-ink-primary">This run doesn&apos;t connect.</h1>
        <p className="text-body text-ink-secondary">The page you wanted isn&apos;t here.</p>
      </div>
      <Link href="/" className="btn-primary w-full sm:w-auto">Back to start</Link>
    </main>
  );
}
