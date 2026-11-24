export default function GlobalLoading() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px] animate-pulse bg-accent-cyan/80"
    />
  );
}
