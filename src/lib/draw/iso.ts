export const ISO_AXES = ["x", "-x", "y", "-y", "z", "-z"] as const;
export type IsoAxis = (typeof ISO_AXES)[number];

export type Vec3 = [number, number, number];

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

export interface IsoViewport {
  cellPx: number;
  originX: number;
  originY: number;
}

export const DEFAULT_ISO_VIEWPORT: IsoViewport = {
  cellPx: 36,
  originX: 420,
  originY: 260,
};

export function posKey(pos: Vec3): string {
  return `${pos[0]},${pos[1]},${pos[2]}`;
}

export function samePos(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export function axisUnitVector(axis: IsoAxis): Vec3 {
  switch (axis) {
    case "x":
      return [1, 0, 0];
    case "-x":
      return [-1, 0, 0];
    case "y":
      return [0, 1, 0];
    case "-y":
      return [0, -1, 0];
    case "z":
      return [0, 0, 1];
    case "-z":
      return [0, 0, -1];
  }
}

export function isHorizontalAxis(axis: IsoAxis): boolean {
  return axis !== "z" && axis !== "-z";
}

export function isVerticalAxis(axis: IsoAxis): boolean {
  return axis === "z" || axis === "-z";
}

export function addScaledVec(pos: Vec3, vec: Vec3, scale: number): Vec3 {
  return [
    pos[0] + vec[0] * scale,
    pos[1] + vec[1] * scale,
    pos[2] + vec[2] * scale,
  ];
}

export function manhattanGridLength(a: Vec3, b: Vec3): number {
  return Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) + Math.abs(b[2] - a[2]);
}

export function inferAxisBetween(a: Vec3, b: Vec3): IsoAxis | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const nonZero = [dx !== 0, dy !== 0, dz !== 0].filter(Boolean).length;
  if (nonZero !== 1) return null;

  if (dx > 0) return "x";
  if (dx < 0) return "-x";
  if (dy > 0) return "y";
  if (dy < 0) return "-y";
  if (dz > 0) return "z";
  return "-z";
}

export function isStrictlyBetweenOnAxis(
  a: Vec3,
  b: Vec3,
  candidate: Vec3
): boolean {
  const axis = inferAxisBetween(a, b);
  if (!axis) return false;
  const distAb = manhattanGridLength(a, b);
  const distAm = manhattanGridLength(a, candidate);
  const distMb = manhattanGridLength(candidate, b);
  if (distAm <= 0 || distMb <= 0 || distAm + distMb !== distAb) return false;
  return (
    inferAxisBetween(a, candidate) === axis &&
    inferAxisBetween(candidate, b) === axis
  );
}

export function isoToScreen(
  pos: Vec3,
  viewport: IsoViewport = DEFAULT_ISO_VIEWPORT
): { x: number; y: number } {
  const [gx, gy, gz] = pos;
  return {
    x: viewport.originX + (gx - gy) * COS30 * viewport.cellPx,
    y:
      viewport.originY +
      (gx + gy) * SIN30 * viewport.cellPx -
      gz * viewport.cellPx,
  };
}

export function screenToIsoSnap(
  sx: number,
  sy: number,
  z = 0,
  viewport: IsoViewport = DEFAULT_ISO_VIEWPORT
): Vec3 {
  const u = (sx - viewport.originX) / (COS30 * viewport.cellPx);
  const v = (sy - viewport.originY + z * viewport.cellPx) / (SIN30 * viewport.cellPx);
  const gx = Math.round((u + v) / 2);
  const gy = Math.round((v - u) / 2);
  return [Object.is(gx, -0) ? 0 : gx, Object.is(gy, -0) ? 0 : gy, Math.round(z)];
}
