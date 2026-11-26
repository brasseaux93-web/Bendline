"use client";

import { useEffect, useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const S = 30;
const OX = 170;
const OY = 150;
const C = 0.866;
type P3 = readonly [number, number, number];

const proj = ([x, y, z]: P3): [number, number] => [OX + (x - y) * C * S, OY + (x + y) * 0.5 * S - z * S];
const path = (ps: P3[]) =>
  ps.map((p, i) => {
    const [a, b] = proj(p);
    return `${i ? "L" : "M"}${a.toFixed(1)} ${b.toFixed(1)}`;
  }).join(" ");

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

function Pipe({ d, color, w, delay, live }: { d: string; color: string; w: number; delay: number; live: boolean }) {
  const common = {
    d,
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    initial: { pathLength: live ? 0 : 1 },
    animate: { pathLength: 1 },
    transition: live ? { duration: 0.9, delay, ease: EASE } : { duration: 0 },
  };
  return (
    <g>
      <motion.path {...common} stroke="rgb(var(--bg))" strokeWidth={w + 5} />
      <motion.path {...common} stroke={color} strokeWidth={w} />
      <motion.path {...common} stroke="rgb(255 255 255 / 0.28)" strokeWidth={1.2} />
    </g>
  );
}

function Node({ p, color }: { p: P3; color: string }) {
  const [x, y] = proj(p);
  return <circle cx={x} cy={y} r={5.5} fill="rgb(var(--bg))" stroke={color} strokeWidth={2} />;
}

function Callout({ from, at, text, tone, side }: { from: [number, number]; at: [number, number]; text: string; tone: string; side: "l" | "r" }) {
  const w = text.length * 8 + 18;
  const x = side === "r" ? at[0] : at[0] - w;
  return (
    <g>
      <path d={`M${from[0]} ${from[1]} L${at[0]} ${at[1]}`} stroke={tone} strokeWidth={1} strokeDasharray="2 3" opacity={0.85} />
      <rect x={x} y={at[1] - 12} width={w} height={24} rx={12} fill="rgb(var(--bg-elevated))" stroke={tone} strokeOpacity={0.7} />
      <text x={x + 9} y={at[1] + 4.5} className="font-mono" fontSize={13} fontWeight={500} fill="rgb(var(--ink))">{text}</text>
    </g>
  );
}

export function IsoRiser({ still = false }: { still?: boolean }) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const live = mounted && !reduce && !still;
  const mode = live ? "live" : "still";
  const uid = useId().replace(/:/g, "");
  const A = "rgb(var(--primary))";
  const B = "rgb(var(--accent))";
  const G = "rgb(var(--success))";

  const lattice: string[] = [];
  for (let y = -0.5; y <= 3.5; y += 1) lattice.push(path([[-1, y, 0], [6, y, 0]]));
  for (let x = -1; x <= 6; x += 1) lattice.push(path([[x, -0.5, 0], [x, 3.5, 0]]));
  const floor = path([[-1, -0.5, 0], [6, -0.5, 0], [6, 3.5, 0], [-1, 3.5, 0]]) + " Z";
  const chev = [3.4, 4.2, 5].map((x) => proj([x, 0, 0]));
  const cap = proj([2, 0, 5.1]);

  return (
    <svg
      viewBox="0 0 380 310"
      className="h-auto w-full"
      style={{ opacity: mounted ? 1 : 0 }}
      role="img"
      aria-label="Isometric drain, waste and vent riser: building drain sloping to the sewer, 3 inch stack, water closet and lavatory wet-vent branches, cleanout and vent terminal"
    >
      <defs>
        <radialGradient id={`g-${uid}`} cx="50%" cy="55%" r="55%">
          <stop offset="0.35" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <mask id={`m-${uid}`}>
          <rect width="380" height="310" fill={`url(#g-${uid})`} />
        </mask>
      </defs>

      <g mask={`url(#m-${uid})`}>
        <path d={floor} fill="rgb(var(--accent) / 0.05)" />
        {lattice.map((d, i) => (
          <path key={i} d={d} stroke="rgb(var(--accent) / 0.16)" strokeWidth={0.75} />
        ))}
      </g>

      <Pipe key={`a${mode}`} d={path([[0, 0, 0], [6, 0, 0]])} color={A} w={7} delay={0.1} live={live} />
      <Pipe key={`b${mode}`} d={path([[2, 2.5, 0], [2, 0, 0]])} color={A} w={7} delay={0.5} live={live} />
      <Pipe key={`c${mode}`} d={path([[2, 0, 0], [2, 0, 4.5]])} color={B} w={6} delay={0.3} live={live} />
      <Pipe key={`d${mode}`} d={path([[2, 1.6, 2.5], [2, 0, 2.5]])} color={G} w={5} delay={0.8} live={live} />
      <Pipe key={`e${mode}`} d={path([[0, 0, 0], [0, 0, 0.9]])} color={A} w={5} delay={1} live={live} />
      <Pipe key={`f${mode}`} d={path([[2, 0, 4.5], [2, 0, 5.1]])} color={B} w={4} delay={1.1} live={live} />

      <Node p={[2, 0, 0]} color={A} />
      <Node p={[2, 0, 2.5]} color={G} />
      <Node p={[2, 2.5, 0]} color={A} />
      <Node p={[2, 1.6, 2.5]} color={G} />
      <circle cx={cap[0]} cy={cap[1]} r={3.5} fill={B} />

      {chev.map(([x, y], i) => (
        <path key={i} d="M-4 -3.5 L2 0 L-4 3.5" transform={`translate(${x} ${y}) rotate(30)`} stroke="rgb(var(--bg))" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ))}

      <Callout from={cap} at={[246, 20]} text="VTR 2″" tone={B} side="r" />
      <Callout from={proj([2, 0, 3.4])} at={[252, 75]} text="STACK 3″" tone={B} side="r" />
      <Callout from={proj([2, 0.8, 2.5])} at={[150, 100]} text="LAV 1½″" tone={G} side="l" />
      <Callout from={proj([0, 0, 0.9])} at={[120, 140]} text="CLEANOUT" tone={A} side="l" />
      <Callout from={proj([2, 2.5, 0])} at={[140, 246]} text="WC 3″" tone={A} side="l" />
      <Callout from={proj([4.8, 0, 0])} at={[300, 282]} text="DRAIN 3″ · ¼″/ft" tone={A} side="l" />
    </svg>
  );
}
