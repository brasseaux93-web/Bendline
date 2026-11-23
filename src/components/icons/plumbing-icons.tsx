import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function AdminCodeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z" />
      <path d="M5 18a2 2 0 0 1 2-2h11" />
      <path d="M9 8h6" />
      <path d="M9 12h4" />
    </svg>
  );
}

export function FixtureFaucetIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M18 14v-3a5 5 0 0 0-10 0v2" />
      <path d="M5 13h6" />
      <path d="M16 14h4" />
      <path d="M6 17h12v3H6z" />
      <path d="M12 13v2" />
    </svg>
  );
}

export function WaterHeaterIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="7" y="4" width="10" height="16" rx="2" />
      <path d="M10 4V2" />
      <path d="M14 4V2" />
      <path d="M17 8h3v8" />
      <path d="M12 10.5c1.1 1.2 1.8 2.1 1.8 3.1a1.8 1.8 0 1 1-3.6 0c0-1 .7-1.9 1.8-3.1Z" />
    </svg>
  );
}

export function SupplyManifoldIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="7" r="3.5" />
      <path d="M12 7l1.5-1.5" />
      <path d="M12 10.5V15" />
      <path d="M4 15h16" />
      <path d="M7 15v5" />
      <path d="M17 15v5" />
    </svg>
  );
}

export function BackflowRpzIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M3 11h4l2-3h6l2 3h4" />
      <path d="M9 11l3 3-3 3" />
      <path d="M12 14v6" />
      <path d="M10 20h4" />
    </svg>
  );
}

export function SanitaryWyeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M4 18h16" />
      <path d="M8 18v3" />
      <path d="M12 18l5-8V4" />
      <path d="M14.5 4h5" />
      <path d="M4 15v6" />
      <path d="M20 15v6" />
    </svg>
  );
}

export function VentStackIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M3 9l9-4 9 4" />
      <path d="M12 20V3" />
      <path d="M10 3h4" />
      <path d="M12 15H6v5" />
    </svg>
  );
}

export function PTrapIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M6 4v10a4 4 0 0 0 8 0v-2a3 3 0 0 1 3-3h3" />
      <path d="M4 4h4" />
      <path d="M8 16h4" />
    </svg>
  );
}

export function StormDrainIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M4 10h16" />
      <path d="M7 10a5 5 0 0 1 10 0" />
      <path d="M12 10v10" />
      <path d="M9 17l3 3 3-3" />
    </svg>
  );
}

export function IsometricPipeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M4 16l6-3.5V5.5L16 2" />
      <path d="M10 12.5l7 4v4" />
      <circle cx="4" cy="16" r="1.5" />
      <circle cx="16" cy="2" r="1.5" />
      <circle cx="17" cy="20.5" r="1.5" />
    </svg>
  );
}

export function TopicPlumbingIcon({
  slug,
  className = "h-5 w-5",
}: {
  slug: string;
  className?: string;
}) {
  switch (slug) {
    case "admin-definitions":
      return <AdminCodeIcon className={className} />;
    case "fixtures-fittings":
      return <FixtureFaucetIcon className={className} />;
    case "water-heaters":
      return <WaterHeaterIcon className={className} />;
    case "water-supply-distribution":
      return <SupplyManifoldIcon className={className} />;
    case "backflow-cross-connection":
      return <BackflowRpzIcon className={className} />;
    case "sanitary-drainage-dwv":
      return <SanitaryWyeIcon className={className} />;
    case "vents-venting":
      return <VentStackIcon className={className} />;
    case "traps-interceptors":
      return <PTrapIcon className={className} />;
    case "storm-drainage":
      return <StormDrainIcon className={className} />;
    case "isometric-math-special":
    default:
      return <IsometricPipeIcon className={className} />;
  }
}

export function FixtureGlyphIcon({
  fixtureType,
  className = "h-5 w-5",
}: {
  fixtureType: string;
  className?: string;
}) {
  switch (fixtureType) {
    case "wc":
      return <SanitaryWyeIcon className={className} />;
    case "lav":
    case "sink":
      return <FixtureFaucetIcon className={className} />;
    case "shower":
      return <SupplyManifoldIcon className={className} />;
    case "floor_drain":
      return <StormDrainIcon className={className} />;
    case "water_heater":
      return <WaterHeaterIcon className={className} />;
    default:
      return <PTrapIcon className={className} />;
  }
}
