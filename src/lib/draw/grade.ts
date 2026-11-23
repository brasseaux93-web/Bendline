import type { CodeFamily } from "@/lib/domain/types";
import type {
  DrawEdge,
  DrawGraph,
  DrawNode,
  DrawPipeSystem,
  FittingType,
} from "./graph";
import { isHorizontalAxis } from "./iso";

export const DRAWING_RULE_KEYS = [
  "connectivity",
  "trap_present",
  "vent_reaches_terminal",
  "fitting_appropriateness",
  "slope_direction",
  "sizing_labels",
  "no_dead_ends",
] as const;

export type DrawingRuleKey = (typeof DRAWING_RULE_KEYS)[number];

export interface DrawingRuleRow {
  id?: string;
  code_family: CodeFamily;
  edition: string;
  rule_key: string;
  description_paraphrased: string;
  params: Record<string, unknown>;
  code_ref: string;
}

export interface DrawingExerciseConfig {
  id: string;
  jurisdiction_id: string;
  title: string;
  prompt_md: string;
  fixtures: DrawNode[];
  pipe_system: DrawPipeSystem;
  constraints: Record<string, unknown>;
  scoring_rubric: Record<string, number>;
  ghost_edges?: DrawEdge[];
  hints?: string[];
  time_limit_min?: number;
  status: "draft" | "reviewed" | "published" | "flagged";
  reviewer_id?: string | null;
  reviewed_at?: string | null;
  code_family: CodeFamily;
  edition: string;
}

export interface GradeBreakdownItem {
  rule_key: string;
  passed: boolean;
  configured: boolean;
  points: number;
  max_points: number;
  message: string;
  code_ref?: string;
  offending_node_ids: string[];
}

export interface GradeDrawingOutput {
  score: number;
  max: number;
  breakdown: GradeBreakdownItem[];
}

function buildAdjacency(
  graph: DrawGraph,
  allowedSystems?: Set<DrawPipeSystem>
): Map<string, Array<{ neighborId: string; edge: DrawEdge }>> {
  const adj = new Map<string, Array<{ neighborId: string; edge: DrawEdge }>>();
  for (const node of graph.nodes) {
    adj.set(node.id, []);
  }
  for (const edge of graph.edges) {
    if (allowedSystems && !allowedSystems.has(edge.system)) continue;
    adj.get(edge.from)?.push({ neighborId: edge.to, edge });
    adj.get(edge.to)?.push({ neighborId: edge.from, edge });
  }
  return adj;
}

function bfsDistancesFromTargets(
  adj: Map<string, Array<{ neighborId: string; edge: DrawEdge }>>,
  targetIds: string[]
): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const id of targetIds) {
    dist.set(id, 0);
    queue.push(id);
  }
  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const currDist = dist.get(curr)!;
    for (const { neighborId } of adj.get(curr) ?? []) {
      if (!dist.has(neighborId)) {
        dist.set(neighborId, currDist + 1);
        queue.push(neighborId);
      }
    }
  }
  return dist;
}

function getDrainTargetIds(
  graph: DrawGraph,
  pipeSystem: DrawPipeSystem
): string[] {
  if (pipeSystem === "supply") {
    return graph.nodes
      .filter((n) => n.kind === "terminal" && n.terminalType === "water_main_in")
      .map((n) => n.id);
  }
  if (pipeSystem === "vent") {
    return graph.nodes
      .filter(
        (n) =>
          (n.kind === "terminal" && n.terminalType === "vtr") ||
          n.kind === "stack"
      )
      .map((n) => n.id);
  }
  return graph.nodes
    .filter(
      (n) =>
        (n.kind === "terminal" && n.terminalType === "building_drain_out") ||
        n.kind === "stack"
    )
    .map((n) => n.id);
}

function notConfiguredItem(
  ruleKey: string,
  reason = "Not configured — verify drawing_rules.params in DB."
): GradeBreakdownItem {
  return {
    rule_key: ruleKey,
    passed: false,
    configured: false,
    points: 0,
    max_points: 0,
    message: reason,
    offending_node_ids: [],
  };
}

export function gradeDrawing(params: {
  graph: DrawGraph;
  exercise: DrawingExerciseConfig;
  rules: DrawingRuleRow[];
}): GradeDrawingOutput {
  const { graph, exercise, rules } = params;
  const rulesByKey = new Map<string, DrawingRuleRow>();

  for (const r of rules) {
    if (
      r.code_family === exercise.code_family &&
      r.edition === exercise.edition
    ) {
      rulesByKey.set(r.rule_key, r);
    }
  }

  const breakdown: GradeBreakdownItem[] = [];
  let totalScore = 0;
  let totalMax = 0;

  const rubricEntries = Object.entries(exercise.scoring_rubric);

  for (const [ruleKey, rawWeight] of rubricEntries) {
    const weight = Number(rawWeight);
    if (!Number.isFinite(weight) || weight <= 0) continue;

    const rule = rulesByKey.get(ruleKey);
    if (!rule) {
      breakdown.push(notConfiguredItem(ruleKey));
      continue;
    }

    const p = rule.params ?? {};
    let evalResult: {
      configured: boolean;
      passed: boolean;
      message: string;
      offending_node_ids: string[];
    };

    if (ruleKey === "connectivity") {
      if (p.require_connected_fixtures === null) {
        evalResult = {
          configured: false,
          passed: false,
          message: "Not configured — require_connected_fixtures is null.",
          offending_node_ids: [],
        };
      } else {
        const targets = getDrainTargetIds(graph, exercise.pipe_system);
        const adj = buildAdjacency(graph);
        const dist = bfsDistancesFromTargets(adj, targets);
        const fixtures = graph.nodes.filter((n) => n.kind === "fixture");
        const offending = fixtures
          .filter((f) => !dist.has(f.id))
          .map((f) => f.id);

        if (targets.length === 0 && fixtures.length > 0) {
          evalResult = {
            configured: true,
            passed: false,
            message: `Missing system terminal or stack for ${exercise.pipe_system} connectivity.`,
            offending_node_ids: fixtures.map((f) => f.id),
          };
        } else {
          evalResult = {
            configured: true,
            passed: offending.length === 0,
            message:
              offending.length === 0
                ? "All fixtures connect continuously to the system stack/terminal."
                : `${offending.length} fixture(s) lack a continuous connection to the system terminal/stack.`,
            offending_node_ids: offending,
          };
        }
      }
    } else if (ruleKey === "trap_present") {
      const exempt = p.exempt_fixtures;
      if (!Array.isArray(exempt)) {
        evalResult = {
          configured: false,
          passed: false,
          message: "Not configured — exempt_fixtures param missing or null.",
          offending_node_ids: [],
        };
      } else {
        const exemptSet = new Set(exempt.map(String));
        const adj = buildAdjacency(graph);
        const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
        const offending: string[] = [];

        for (const node of graph.nodes) {
          if (node.kind !== "fixture") continue;
          if (node.fixtureType && exemptSet.has(node.fixtureType)) continue;
          if (node.hasTrap) continue;

          const hasAdjacentTrap = (adj.get(node.id) ?? []).some(
            ({ neighborId }) => nodeById.get(neighborId)?.fittingType === "p_trap"
          );
          if (!hasAdjacentTrap) {
            offending.push(node.id);
          }
        }

        evalResult = {
          configured: true,
          passed: offending.length === 0,
          message:
            offending.length === 0
              ? "Every required fixture includes a P-trap seal."
              : `${offending.length} fixture(s) missing a required P-trap.`,
          offending_node_ids: offending,
        };
      }
    } else if (ruleKey === "vent_reaches_terminal") {
      const minRise = p.min_vent_rise_above_fixture;
      if (typeof minRise !== "number" || !Number.isFinite(minRise)) {
        evalResult = {
          configured: false,
          passed: false,
          message:
            "Not configured — min_vent_rise_above_fixture param missing or null.",
          offending_node_ids: [],
        };
      } else {
        const vtrNodes = graph.nodes.filter(
          (n) => n.kind === "terminal" && n.terminalType === "vtr"
        );
        const ventAdj = buildAdjacency(
          graph,
          new Set<DrawPipeSystem>(["vent", "dwv"])
        );
        const ventOnlyAdj = buildAdjacency(
          graph,
          new Set<DrawPipeSystem>(["vent"])
        );
        const vtrReach = bfsDistancesFromTargets(
          ventAdj,
          vtrNodes.map((v) => v.id)
        );

        const offending: string[] = [];
        const fixtures = graph.nodes.filter((n) => n.kind === "fixture");

        for (const fx of fixtures) {
          const reachesVtr = vtrReach.has(fx.id);
          // Also check at least one VTR reaches >= fixture.pos[2] + minRise and a vent branch exists
          const validTerminalElevation = vtrNodes.some(
            (v) => v.pos[2] >= fx.pos[2] + minRise
          );
          const hasVentConnection =
            (ventOnlyAdj.get(fx.id)?.length ?? 0) > 0 ||
            graph.edges.some((e) => e.system === "vent");

          if (!reachesVtr || !validTerminalElevation || !hasVentConnection) {
            offending.push(fx.id);
          }
        }

        evalResult = {
          configured: true,
          passed: offending.length === 0 && vtrNodes.length > 0,
          message:
            offending.length === 0 && vtrNodes.length > 0
              ? `Venting reaches an elevated roof terminal (>= +${minRise} grid units above fixtures).`
              : "One or more fixtures lack a valid vent path to an elevated VTR terminal.",
          offending_node_ids:
            offending.length > 0
              ? offending
              : fixtures.map((f) => f.id),
        };
      }
    } else if (ruleKey === "fitting_appropriateness") {
      const prohibited = p.prohibited_horizontal_dwv_fittings;
      if (!Array.isArray(prohibited)) {
        evalResult = {
          configured: false,
          passed: false,
          message:
            "Not configured — prohibited_horizontal_dwv_fittings param missing or null.",
          offending_node_ids: [],
        };
      } else {
        const prohibitedSet = new Set(prohibited.map(String));
        const adj = buildAdjacency(graph);
        const offending: string[] = [];

        for (const node of graph.nodes) {
          if (node.kind !== "fitting" || !node.fittingType) continue;
          const edges = adj.get(node.id) ?? [];
          const hasHorizontalDwv = edges.some(
            ({ edge }) =>
              edge.system === "dwv" && isHorizontalAxis(edge.axis)
          );
          // Only flag branch junctions (degree >= 3) or explicit prohibited fittings on horizontal DWV
          const isBranchJunction = edges.length >= 3;
          if (
            hasHorizontalDwv &&
            prohibitedSet.has(node.fittingType) &&
            (node.fittingType !== "tee" || isBranchJunction)
          ) {
            offending.push(node.id);
          }
        }

        evalResult = {
          configured: true,
          passed: offending.length === 0,
          message:
            offending.length === 0
              ? "All horizontal DWV fittings comply with directional flow rules."
              : `Inappropriate fitting(s) found on horizontal DWV run (use wye/long-sweep instead).`,
          offending_node_ids: offending,
        };
      }
    } else if (ruleKey === "slope_direction") {
      const minSlope = p.min_slope_in_per_ft;
      if (typeof minSlope !== "number" || !Number.isFinite(minSlope)) {
        evalResult = {
          configured: false,
          passed: false,
          message:
            "Not configured — min_slope_in_per_ft param missing or null.",
          offending_node_ids: [],
        };
      } else {
        const drainTargets = getDrainTargetIds(graph, "dwv");
        const dwvAdj = buildAdjacency(
          graph,
          new Set<DrawPipeSystem>(["dwv"])
        );
        const distToDrain = bfsDistancesFromTargets(dwvAdj, drainTargets);
        const offending = new Set<string>();

        const horizDwvEdges = graph.edges.filter(
          (e) => e.system === "dwv" && isHorizontalAxis(e.axis)
        );

        for (const edge of horizDwvEdges) {
          const validMagnitude =
            typeof edge.slope === "number" && edge.slope >= minSlope;
          const dFrom = distToDrain.get(edge.from);
          const dTo = distToDrain.get(edge.to);
          let validDirection = true;

          if (dFrom !== undefined && dTo !== undefined) {
            const toward = edge.slopeToward ?? "to";
            if (toward === "to" && dTo > dFrom) validDirection = false;
            if (toward === "from" && dFrom > dTo) validDirection = false;
          } else if (drainTargets.length > 0) {
            validDirection = false;
          }

          if (!validMagnitude || !validDirection) {
            offending.add(edge.from);
            offending.add(edge.to);
          }
        }

        evalResult = {
          configured: true,
          passed: offending.size === 0,
          message:
            offending.size === 0
              ? `Horizontal DWV runs pitch toward drain at >= ${minSlope} in/ft.`
              : `Horizontal DWV run(s) missing >= ${minSlope} in/ft slope toward drain.`,
          offending_node_ids: [...offending],
        };
      }
    } else if (ruleKey === "sizing_labels") {
      const minBySys = p.min_size_by_system;
      if (
        typeof minBySys !== "object" ||
        minBySys === null ||
        Array.isArray(minBySys)
      ) {
        evalResult = {
          configured: false,
          passed: false,
          message:
            "Not configured — min_size_by_system param missing or null.",
          offending_node_ids: [],
        };
      } else {
        const sizeMap = minBySys as Record<string, unknown>;
        const offending = new Set<string>();

        for (const edge of graph.edges) {
          const minRequired = sizeMap[edge.system];
          if (typeof minRequired !== "number") {
            evalResult = {
              configured: false,
              passed: false,
              message: `Not configured — missing min_size_by_system["${edge.system}"].`,
              offending_node_ids: [],
            };
            break;
          }
          if (edge.size === null || edge.size < minRequired) {
            offending.add(edge.from);
            offending.add(edge.to);
          }
        }

        evalResult ??= {
          configured: true,
          passed: offending.size === 0,
          message:
            offending.size === 0
              ? "All pipe runs have valid nominal size labels."
              : "One or more pipe runs are missing size labels or fall below minimum size.",
          offending_node_ids: [...offending],
        };
      }
    } else if (ruleKey === "no_dead_ends") {
      const permitted = p.permitted_dead_end_fittings;
      if (!Array.isArray(permitted)) {
        evalResult = {
          configured: false,
          passed: false,
          message:
            "Not configured — permitted_dead_end_fittings param missing or null.",
          offending_node_ids: [],
        };
      } else {
        const permittedSet = new Set<FittingType | string>(
          permitted.map(String)
        );
        const adj = buildAdjacency(graph);
        const offending: string[] = [];

        for (const node of graph.nodes) {
          if (
            node.kind === "fixture" ||
            node.kind === "terminal" ||
            node.kind === "stack"
          ) {
            continue;
          }
          if (node.fittingType && permittedSet.has(node.fittingType)) {
            continue;
          }
          const degree = adj.get(node.id)?.length ?? 0;
          if (degree <= 1) {
            offending.push(node.id);
          }
        }

        evalResult = {
          configured: true,
          passed: offending.length === 0,
          message:
            offending.length === 0
              ? "No unpermitted dead-end piping nodes detected."
              : `${offending.length} dead-end fitting node(s) detected (terminate at fixture, stack, terminal, or permitted cleanout).`,
          offending_node_ids: offending,
        };
      }
    } else {
      evalResult = {
        configured: false,
        passed: false,
        message: `Not configured — unknown rule_key "${ruleKey}".`,
        offending_node_ids: [],
      };
    }

    if (!evalResult.configured) {
      breakdown.push({
        rule_key: ruleKey,
        passed: false,
        configured: false,
        points: 0,
        max_points: 0,
        message: evalResult.message,
        code_ref: rule.code_ref,
        offending_node_ids: [],
      });
    } else {
      const earned = evalResult.passed ? weight : 0;
      totalScore += earned;
      totalMax += weight;
      breakdown.push({
        rule_key: ruleKey,
        passed: evalResult.passed,
        configured: true,
        points: earned,
        max_points: weight,
        message: evalResult.message,
        code_ref: rule.code_ref,
        offending_node_ids: evalResult.offending_node_ids,
      });
    }
  }

  return {
    score: totalScore,
    max: totalMax,
    breakdown,
  };
}
