export function LandingProof() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 pb-12 sm:px-6">
      <section id="tracks" aria-labelledby="tracks-heading" className="scroll-mt-24 space-y-4">
        <h2 id="tracks-heading" className="text-h1 text-ink-primary">Two tracks</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <article className="bento-card space-y-2">
            <p className="font-mono text-xs text-accent-cyan">Planned</p>
            <h3 className="text-h3">Apprentice</h3>
            <p className="text-sm text-ink-secondary">Learn code fundamentals in plain English, follow guided isometric builds, and keep a personal on-the-job hours log. Trade-school chapter alignment is planned.</p>
          </article>
          <article className="bento-card space-y-2">
            <h3 className="text-h3">Journeyman</h3>
            <p className="text-sm text-ink-secondary">Practice against your selected jurisdiction, work through timed sets and blank-canvas isometrics, and see which topics need more evidence before a readiness score appears.</p>
          </article>
        </div>
      </section>
      <section aria-labelledby="diagnostic-preview-heading" className="bento-card grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          <p className="font-mono text-xs text-accent-cyan">WORKED EXAMPLE</p>
          <h2 id="diagnostic-preview-heading" className="text-h2">45° rolling offset</h2>
          <p className="text-sm text-ink-secondary">A pipe rises 6 in. and rolls 8 in. sideways. With two 45° fittings, what is the center-to-center travel before fitting takeout?</p>
          <svg viewBox="0 0 280 120" className="h-auto w-full max-w-xs text-accent-cyan" aria-hidden="true">
            <path d="M24 96H176V24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 4" />
            <path d="M24 96L176 24" fill="none" stroke="currentColor" strokeWidth="3" />
            <g fill="currentColor" fontSize="11" fontFamily="monospace">
              <text x="68" y="114">8 in. roll</text><text x="184" y="64">6 in. rise</text><text x="50" y="38">10 in. true offset</text>
            </g>
          </svg>
        </div>
        <div className="space-y-3 rounded-xl border border-line-subtle bg-canvas p-4">
          <span className="inline-block rounded-full border border-accent-cyan/40 px-2.5 py-1 font-mono text-xs text-accent-cyan">Concept</span>
          <p className="text-sm"><strong>Sample answer:</strong> 10 in. <strong>Correct:</strong> 14.14 in.</p>
          <p className="text-sm text-ink-secondary">You found the true offset, not the travel. Use the true offset as the input for the 45° calculation.</p>
          <div className="space-y-1 font-mono text-sm">
            <p>Offset = √(6² + 8²) = 10 in.</p>
            <p>Travel = 10 ÷ sin(45°) ≈ 14.14 in.</p>
          </div>
          <p className="text-xs text-ink-secondary">Reference: right-triangle geometry. No code table applies.</p>
        </div>
      </section>
      <section aria-labelledby="pricing-heading" className="space-y-3">
        <h2 id="pricing-heading" className="text-h2">Pricing before sign-in</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="bento-card space-y-1"><dt className="font-semibold">Free · $0</dt><dd className="text-sm text-ink-secondary">Start with the free diagnostic and browse the Public Accuracy Ledger.</dd></div>
          <div className="bento-card space-y-1"><dt className="font-semibold">Exam-Window Pass · Planned</dt><dd className="text-sm text-ink-secondary">One-time payment. No auto-renew. Price and access duration have not been announced.</dd></div>
        </dl>
      </section>
    </div>
  );
}
