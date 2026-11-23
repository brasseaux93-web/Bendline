"use client";

import { useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { useAppState } from "@/components/providers/app-state-provider";
import type {
  DrawEdge,
  DrawGraph,
  DrawNode,
  FittingType,
  FixtureType,
} from "@/lib/draw/graph";
import {
  DEFAULT_ISO_VIEWPORT,
  type IsoAxis,
  type Vec3,
  isoToScreen,
  samePos,
  screenToIsoSnap,
} from "@/lib/draw/iso";
import { MOTION_DURATION, MOTION_SPRING } from "@/lib/motion";

export type ActiveDrawTool =
  | { kind: "run" }
  | { kind: "fitting"; fittingType: FittingType }
  | { kind: "fixture"; fixtureType: FixtureType }
  | { kind: "terminal"; terminalType: "vtr" | "building_drain_out" | "water_main_in" }
  | { kind: "label" }
  | { kind: "slope" };

interface IsoCanvasProps {
  graph: DrawGraph;
  ghostEdges?: DrawEdge[];
  activeTool: ActiveDrawTool;
  cursorPos: Vec3;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  offendingNodeMap: Map<string, string[]>;
  recentFlowEdgeIds: string[];
  onCursorChange: (pos: Vec3) => void;
  onCanvasPlaceAt: (pos: Vec3) => void;
  onKeyboardExtendRun: (axis: IsoAxis) => void;
  onSelectNode: (nodeId: string | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onUndo: () => void;
  onRedo: () => void;
}

const SYSTEM_STROKE: Record<DrawEdge["system"], string> = {
  dwv: "rgb(var(--primary))",
  vent: "rgb(var(--accent))",
  supply: "rgb(var(--success))",
};

const NODE_BADGE: Record<string, string> = {
  wc: "WC",
  lav: "LAV",
  sink: "SNK",
  shower: "SHW",
  floor_drain: "FD",
  water_heater: "WH",
  vtr: "VTR",
  building_drain_out: "OUT",
  water_main_in: "IN",
  elbow_90: "90",
  elbow_45: "45",
  tee: "T",
  wye: "Y",
  reducer: "RED",
  cleanout: "CO",
  valve: "VLV",
  p_trap: "TRP",
};

export function IsoCanvas({
  graph,
  ghostEdges = [],
  activeTool,
  cursorPos,
  selectedNodeId,
  selectedEdgeId,
  offendingNodeMap,
  recentFlowEdgeIds,
  onCursorChange,
  onCanvasPlaceAt,
  onKeyboardExtendRun,
  onSelectNode,
  onSelectEdge,
  onUndo,
  onRedo,
}: IsoCanvasProps) {
  const prefersReduced = useReducedMotion();
  const { reduceMotion } = useAppState();
  const reduced = Boolean(prefersReduced || reduceMotion);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const activePointersRef = useRef<
    Map<number, { clientX: number; clientY: number }>
  >(new Map());
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);
  const panStartRef = useRef<{
    clientX: number;
    clientY: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);

  const nodeById = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n])),
    [graph.nodes]
  );

  // Build SVG 3-axis isometric grid lines covering [-6..6] in x/y at z=0 plus vertical axis posts
  const gridLines = useMemo(() => {
    const lines: Array<{
      key: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      kind: "h" | "v";
    }> = [];
    const range = 6;
    for (let i = -range; i <= range; i += 1) {
      const p1 = isoToScreen([i, -range, 0]);
      const p2 = isoToScreen([i, range, 0]);
      lines.push({
        key: `gx-${i}`,
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        kind: "h",
      });

      const q1 = isoToScreen([-range, i, 0]);
      const q2 = isoToScreen([range, i, 0]);
      lines.push({
        key: `gy-${i}`,
        x1: q1.x,
        y1: q1.y,
        x2: q2.x,
        y2: q2.y,
        kind: "h",
      });
    }
    for (let x = -4; x <= 4; x += 2) {
      for (let y = -4; y <= 4; y += 2) {
        const b = isoToScreen([x, y, -2]);
        const t = isoToScreen([x, y, 4]);
        lines.push({
          key: `gz-${x}-${y}`,
          x1: b.x,
          y1: b.y,
          x2: t.x,
          y2: t.y,
          kind: "v",
        });
      }
    }
    return lines;
  }, []);

  function clientToSvgWorld(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 420, y: 260 };
    const rect = svg.getBoundingClientRect();
    const viewX = ((clientX - rect.left) / Math.max(1, rect.width)) * 840;
    const viewY = ((clientY - rect.top) / Math.max(1, rect.height)) * 520;
    return {
      x: (viewX - 420 - pan.x) / zoom + 420,
      y: (viewY - 260 - pan.y) / zoom + 260,
    };
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointersRef.current.set(e.pointerId, {
      clientX: e.clientX,
      clientY: e.clientY,
    });

    if (activePointersRef.current.size === 2) {
      const pts = [...activePointersRef.current.values()];
      pinchStartDistRef.current = Math.hypot(
        pts[0].clientX - pts[1].clientX,
        pts[0].clientY - pts[1].clientY
      );
      pinchStartZoomRef.current = zoom;
      panStartRef.current = null;
      return;
    }

    panStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
    };
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, {
        clientX: e.clientX,
        clientY: e.clientY,
      });
    }

    if (activePointersRef.current.size === 2 && pinchStartDistRef.current) {
      const pts = [...activePointersRef.current.values()];
      const dist = Math.hypot(
        pts[0].clientX - pts[1].clientX,
        pts[0].clientY - pts[1].clientY
      );
      const scale = dist / Math.max(1, pinchStartDistRef.current);
      setZoom(
        Math.min(2.5, Math.max(0.5, Number((pinchStartZoomRef.current * scale).toFixed(2))))
      );
      return;
    }

    const panStart = panStartRef.current;
    if (panStart) {
      const dx = e.clientX - panStart.clientX;
      const dy = e.clientY - panStart.clientY;
      if (Math.hypot(dx, dy) > 6) {
        panStart.moved = true;
        setPan({ x: panStart.panX + dx, y: panStart.panY + dy });
      }
      return;
    }

    const world = clientToSvgWorld(e.clientX, e.clientY);
    const snapped = screenToIsoSnap(
      world.x,
      world.y,
      cursorPos[2],
      DEFAULT_ISO_VIEWPORT
    );
    if (!samePos(snapped, cursorPos)) {
      onCursorChange(snapped);
    }
  }

  function handlePointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const panStart = panStartRef.current;
    const wasTap = panStart && !panStart.moved && activePointersRef.current.size === 1;
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchStartDistRef.current = null;
    }
    panStartRef.current = null;

    if (wasTap) {
      const world = clientToSvgWorld(e.clientX, e.clientY);
      const snapped = screenToIsoSnap(
        world.x,
        world.y,
        cursorPos[2],
        DEFAULT_ISO_VIEWPORT
      );
      onCursorChange(snapped);
      onCanvasPlaceAt(snapped);
    }
  }

  function handlePointerCancel(e: React.PointerEvent<SVGSVGElement>) {
    activePointersRef.current.delete(e.pointerId);
    pinchStartDistRef.current = null;
    panStartRef.current = null;
  }

  function handleKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) {
        onRedo();
      } else {
        onUndo();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      onRedo();
      return;
    }

    let axis: IsoAxis | null = null;
    if (e.key === "ArrowRight") axis = "x";
    else if (e.key === "ArrowLeft") axis = "-x";
    else if (e.key === "ArrowDown") axis = "y";
    else if (e.key === "ArrowUp") axis = "-y";
    else if (e.key === "PageUp") axis = "z";
    else if (e.key === "PageDown") axis = "-z";

    if (axis) {
      e.preventDefault();
      if (e.shiftKey) {
        onKeyboardExtendRun(axis);
      } else {
        const delta: Vec3 =
          axis === "x"
            ? [1, 0, 0]
            : axis === "-x"
              ? [-1, 0, 0]
              : axis === "y"
                ? [0, 1, 0]
                : axis === "-y"
                  ? [0, -1, 0]
                  : axis === "z"
                    ? [0, 0, 1]
                    : [0, 0, -1];
        onCursorChange([
          cursorPos[0] + delta[0],
          cursorPos[1] + delta[1],
          cursorPos[2] + delta[2],
        ]);
      }
      return;
    }

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onCanvasPlaceAt(cursorPos);
    }
  }

  const cursorScreen = isoToScreen(cursorPos);
  const flowSet = useMemo(
    () => new Set(recentFlowEdgeIds),
    [recentFlowEdgeIds]
  );

  return (
    <div className="iso-bg relative overflow-hidden rounded-2xl border border-border">
      {/* Canvas Zoom Controls */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-xl border border-border bg-glass/85 p-1 backdrop-blur-md">
        <button
          type="button"
          onClick={() =>
            setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))
          }
          aria-label="Zoom out canvas"
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-ink hover:bg-elevated"
        >
          <ZoomOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <span className="px-1.5 font-mono text-caption tabular-nums text-muted">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() =>
            setZoom((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))))
          }
          aria-label="Zoom in canvas"
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-ink hover:bg-elevated"
        >
          <ZoomIn className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          aria-label="Reset canvas pan and zoom"
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-muted hover:bg-elevated hover:text-ink"
        >
          <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      {/* Live coordinate & keyboard mode readout */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg border border-border/80 bg-glass/85 px-2.5 py-1 font-mono text-caption tabular-nums text-ink backdrop-blur-md">
        Grid [{cursorPos[0]}, {cursorPos[1]}, {cursorPos[2]}] · Tool:{" "}
        {activeTool.kind} · Arrows move, Shift+Arrow runs, Enter places
      </div>

      <svg
        ref={svgRef}
        tabIndex={0}
        role="application"
        aria-label="Isometric pipe drawing canvas. Use arrow keys and PageUp/PageDown to move the grid cursor, Enter to place, and Shift plus arrow keys to extend a pipe run."
        viewBox="0 0 840 520"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleKeyDown}
        data-testid="iso-canvas-svg"
        className="h-[420px] w-full touch-none select-none focus:outline-none sm:h-[520px]"
      >
        <g
          transform={`translate(${420 + pan.x}, ${260 + pan.y}) scale(${zoom}) translate(-420, -260)`}
        >
          {/* Three-axis isometric SVG grid */}
          {gridLines.map((line) => (
            <line
              key={line.key}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={
                line.kind === "v"
                  ? "rgb(var(--accent) / 0.16)"
                  : "rgb(var(--border) / 0.25)"
              }
              strokeWidth={1}
              strokeDasharray={line.kind === "v" ? "3 4" : undefined}
            />
          ))}

          {/* Learn mode ghost guide edges */}
          {ghostEdges.map((edge) => {
            const fromN = nodeById.get(edge.from);
            const toN = nodeById.get(edge.to);
            if (!fromN || !toN) return null;
            const p1 = isoToScreen(fromN.pos);
            const p2 = isoToScreen(toN.pos);
            return (
              <line
                key={`ghost-${edge.id}`}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="rgb(var(--accent) / 0.45)"
                strokeWidth={5}
                strokeDasharray="8 6"
                strokeLinecap="round"
              />
            );
          })}

          {/* Pipe run edges with pathLength draw + optional flow pulse */}
          {graph.edges.map((edge) => {
            const fromN = nodeById.get(edge.from);
            const toN = nodeById.get(edge.to);
            if (!fromN || !toN) return null;
            const p1 = isoToScreen(fromN.pos);
            const p2 = isoToScreen(toN.pos);
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const strokeColor = SYSTEM_STROKE[edge.system];
            const isSelected = edge.id === selectedEdgeId;
            const hasFlow = flowSet.has(edge.id);

            return (
              <g
                key={edge.id}
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  onSelectEdge(edge.id);
                }}
                className="cursor-pointer"
              >
                <motion.line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={isSelected ? "rgb(var(--ink))" : strokeColor}
                  strokeWidth={isSelected ? 7 : 5}
                  strokeLinecap="round"
                  initial={reduced ? { opacity: 0 } : { pathLength: 0, opacity: 0.4 }}
                  animate={reduced ? { opacity: 1 } : { pathLength: 1, opacity: 1 }}
                  transition={{ duration: MOTION_DURATION.normal }}
                />

                {hasFlow && !reduced && (
                  <motion.line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke="rgb(var(--ink))"
                    strokeWidth={3}
                    strokeDasharray="10 18"
                    strokeLinecap="round"
                    initial={{ strokeDashoffset: 40, opacity: 0.9 }}
                    animate={{ strokeDashoffset: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  />
                )}

                {/* Pipe size & slope annotations */}
                {(edge.size !== null || (edge.slope ?? null) !== null) && (
                  <g transform={`translate(${midX}, ${midY - 12})`}>
                    <rect
                      x={-26}
                      y={-10}
                      width={52}
                      height={18}
                      rx={5}
                      fill="rgb(var(--bg) / 0.92)"
                      stroke="rgb(var(--border))"
                      strokeWidth={1}
                    />
                    <text
                      textAnchor="middle"
                      y={3}
                      fill="rgb(var(--ink))"
                      fontSize={10}
                      fontFamily="monospace"
                    >
                      {edge.size ? `${edge.size}"` : "?"}
                      {typeof edge.slope === "number" ? ` ${edge.slope}` : ""}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Nodes (fixtures, fittings, terminals, stacks) + offending error rings */}
          {graph.nodes.map((node: DrawNode) => {
            const pt = isoToScreen(node.pos);
            const isSelected = node.id === selectedNodeId;
            const offendingRules = offendingNodeMap.get(node.id) ?? [];
            const hasError = offendingRules.length > 0;
            const badge =
              NODE_BADGE[
                node.fixtureType ??
                  node.fittingType ??
                  node.terminalType ??
                  "stack"
              ] ?? (node.kind === "stack" ? "STK" : "FIT");

            const fill =
              node.kind === "fixture"
                ? "rgb(var(--card))"
                : node.kind === "terminal"
                  ? "rgb(var(--accent) / 0.25)"
                  : node.kind === "stack"
                    ? "rgb(var(--primary))"
                    : "rgb(var(--bg-elevated))";
            const textColor =
              node.kind === "stack" ? "rgb(10 14 20)" : "rgb(var(--ink))";

            return (
              <motion.g
                key={node.id}
                transform={`translate(${pt.x}, ${pt.y})`}
                initial={reduced ? { opacity: 0 } : { scale: 0.65, opacity: 0 }}
                animate={reduced ? { opacity: 1 } : { scale: 1, opacity: 1 }}
                transition={MOTION_SPRING.snappy}
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  onCursorChange(node.pos);
                  onSelectNode(node.id);
                }}
                className="cursor-pointer"
              >
                {hasError && (
                  <g>
                    <circle
                      r={22}
                      fill="rgb(var(--error) / 0.14)"
                      stroke="rgb(var(--error))"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                    />
                    <text
                      y={-26}
                      textAnchor="middle"
                      fill="rgb(var(--error))"
                      fontSize={10}
                      fontWeight="700"
                      fontFamily="monospace"
                    >
                      ! {offendingRules[0]}
                    </text>
                  </g>
                )}

                <circle
                  r={node.kind === "fitting" ? 13 : 16}
                  fill={fill}
                  stroke={
                    isSelected
                      ? "rgb(var(--accent))"
                      : hasError
                        ? "rgb(var(--error))"
                        : "rgb(var(--muted))"
                  }
                  strokeWidth={isSelected ? 2.5 : 1.75}
                />

                <text
                  y={4}
                  textAnchor="middle"
                  fill={textColor}
                  fontSize={10}
                  fontWeight="700"
                  fontFamily="monospace"
                >
                  {badge}
                </text>
              </motion.g>
            );
          })}

          {/* Snapped active cursor crosshair */}
          <g
            transform={`translate(${cursorScreen.x}, ${cursorScreen.y})`}
            className="pointer-events-none"
          >
            <circle
              r={18}
              fill="none"
              stroke="rgb(var(--accent))"
              strokeWidth={1.75}
              strokeDasharray="4 3"
            />
            <circle r={3} fill="rgb(var(--accent))" />
          </g>
        </g>
      </svg>
    </div>
  );
}
