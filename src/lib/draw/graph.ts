import { z } from "zod";
import {
  ISO_AXES,
  type IsoAxis,
  type Vec3,
  addScaledVec,
  axisUnitVector,
  inferAxisBetween,
  isHorizontalAxis,
  isStrictlyBetweenOnAxis,
  manhattanGridLength,
  posKey,
  samePos,
} from "./iso";

export const nodeKindSchema = z.enum([
  "fixture",
  "fitting",
  "terminal",
  "stack",
]);
export type NodeKind = z.infer<typeof nodeKindSchema>;

export const fixtureTypeSchema = z.enum([
  "wc",
  "lav",
  "sink",
  "shower",
  "floor_drain",
  "water_heater",
]);
export type FixtureType = z.infer<typeof fixtureTypeSchema>;

export const fittingTypeSchema = z.enum([
  "elbow_90",
  "elbow_45",
  "tee",
  "wye",
  "reducer",
  "cleanout",
  "valve",
  "p_trap",
]);
export type FittingType = z.infer<typeof fittingTypeSchema>;

export const terminalTypeSchema = z.enum([
  "vtr",
  "building_drain_out",
  "water_main_in",
]);
export type TerminalType = z.infer<typeof terminalTypeSchema>;

export const pipeSystemSchema = z.enum(["dwv", "vent", "supply"]);
export type DrawPipeSystem = z.infer<typeof pipeSystemSchema>;

export const isoAxisSchema = z.enum(ISO_AXES);

export const vec3Schema = z.tuple([
  z.number().int(),
  z.number().int(),
  z.number().int(),
]);

export const drawNodeSchema = z.object({
  id: z.string().min(1),
  pos: vec3Schema,
  kind: nodeKindSchema,
  fixtureType: fixtureTypeSchema.optional(),
  fittingType: fittingTypeSchema.optional(),
  terminalType: terminalTypeSchema.optional(),
  hasTrap: z.boolean().optional(),
  label: z.string().optional(),
});
export type DrawNode = z.infer<typeof drawNodeSchema>;

export const drawEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  axis: isoAxisSchema,
  length: z.number().int().positive(),
  size: z.number().positive().nullable().default(null),
  system: pipeSystemSchema,
  slope: z.number().min(0).nullable().optional(),
  slopeToward: z.enum(["from", "to"]).optional(),
});
export type DrawEdge = z.infer<typeof drawEdgeSchema>;

export const drawGraphSchema = z.object({
  nodes: z.array(drawNodeSchema),
  edges: z.array(drawEdgeSchema),
});
export type DrawGraph = z.infer<typeof drawGraphSchema>;

export interface GraphValidationResult {
  valid: boolean;
  errors: string[];
}

export function createEmptyGraph(): DrawGraph {
  return { nodes: [], edges: [] };
}

function nextNodeId(graph: DrawGraph, prefix = "n"): string {
  const existing = new Set(graph.nodes.map((n) => n.id));
  let idx = graph.nodes.length + 1;
  while (existing.has(`${prefix}-${idx}`)) {
    idx += 1;
  }
  return `${prefix}-${idx}`;
}

function nextEdgeId(graph: DrawGraph): string {
  const existing = new Set(graph.edges.map((e) => e.id));
  let idx = graph.edges.length + 1;
  while (existing.has(`e-${idx}`)) {
    idx += 1;
  }
  return `e-${idx}`;
}

export function inferAutoFitting(params: {
  existingEdgesAtNode: DrawEdge[];
  newAxis: IsoAxis;
  newSystem: DrawPipeSystem;
  newSize: number | null;
  overrideFitting?: FittingType;
}): FittingType {
  if (params.overrideFitting) {
    return params.overrideFitting;
  }

  const { existingEdgesAtNode, newAxis, newSystem, newSize } = params;
  if (existingEdgesAtNode.length === 0) {
    return "elbow_90";
  }

  const hasSizeChange = existingEdgesAtNode.some(
    (e) => e.size !== null && newSize !== null && Math.abs(e.size - newSize) > 1e-6
  );
  if (hasSizeChange) {
    return "reducer";
  }

  const totalEdgesAfter = existingEdgesAtNode.length + 1;
  if (totalEdgesAfter >= 3) {
    if (
      newSystem === "dwv" &&
      isHorizontalAxis(newAxis) &&
      existingEdgesAtNode.some((e) => isHorizontalAxis(e.axis))
    ) {
      return "wye";
    }
    return "tee";
  }

  return "elbow_90";
}

function edgePairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function applyAutoFittingAtNode(
  graph: DrawGraph,
  nodeId: string,
  incomingEdge: DrawEdge,
  overrideFitting?: FittingType
): DrawGraph {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node || node.kind !== "fitting") return graph;

  const existingOthers = graph.edges.filter(
    (e) =>
      e.id !== incomingEdge.id && (e.from === nodeId || e.to === nodeId)
  );
  if (existingOthers.length === 0 && !overrideFitting) return graph;

  const chosen = inferAutoFitting({
    existingEdgesAtNode: existingOthers,
    newAxis: incomingEdge.axis,
    newSystem: incomingEdge.system,
    newSize: incomingEdge.size,
    overrideFitting,
  });

  return {
    ...graph,
    nodes: graph.nodes.map((n) =>
      n.id === nodeId ? { ...n, fittingType: chosen } : n
    ),
  };
}

export function placeNode(
  graph: DrawGraph,
  nodeInput: Omit<DrawNode, "id"> & { id?: string }
): { graph: DrawGraph; node: DrawNode } {
  const existingAtPos = graph.nodes.find((n) => samePos(n.pos, nodeInput.pos));
  if (existingAtPos) {
    const merged: DrawNode = {
      ...existingAtPos,
      ...nodeInput,
      id: existingAtPos.id,
    };
    return {
      graph: {
        ...graph,
        nodes: graph.nodes.map((n) => (n.id === existingAtPos.id ? merged : n)),
      },
      node: merged,
    };
  }

  // If placed directly on an existing edge interior, split the edge first
  const hostEdge = graph.edges.find((e) => {
    const fromN = graph.nodes.find((n) => n.id === e.from);
    const toN = graph.nodes.find((n) => n.id === e.to);
    return (
      fromN &&
      toN &&
      isStrictlyBetweenOnAxis(fromN.pos, toN.pos, nodeInput.pos)
    );
  });

  let workingGraph = graph;
  const targetId = nodeInput.id ?? nextNodeId(workingGraph, nodeInput.kind.slice(0, 1));
  if (hostEdge) {
    const splitRes = splitEdge(
      workingGraph,
      hostEdge.id,
      nodeInput.pos,
      nodeInput.fittingType
    );
    workingGraph = splitRes.graph;
    const upgraded: DrawNode = {
      ...splitRes.splitNode,
      ...nodeInput,
      id: splitRes.splitNode.id,
    };
    return {
      graph: {
        ...workingGraph,
        nodes: workingGraph.nodes.map((n) =>
          n.id === upgraded.id ? upgraded : n
        ),
      },
      node: upgraded,
    };
  }

  const created: DrawNode = {
    ...nodeInput,
    id: targetId,
  };
  return {
    graph: {
      ...workingGraph,
      nodes: [...workingGraph.nodes, created],
    },
    node: created,
  };
}

export function splitEdge(
  graph: DrawGraph,
  edgeId: string,
  splitPos: Vec3,
  junctionFitting?: FittingType
): { graph: DrawGraph; splitNode: DrawNode; edges: [DrawEdge, DrawEdge] } {
  const edge = graph.edges.find((e) => e.id === edgeId);
  if (!edge) {
    throw new Error(`Edge "${edgeId}" not found for splitEdge.`);
  }

  const fromNode = graph.nodes.find((n) => n.id === edge.from);
  const toNode = graph.nodes.find((n) => n.id === edge.to);
  if (!fromNode || !toNode) {
    throw new Error(`Edge "${edgeId}" references missing endpoints.`);
  }

  if (!isStrictlyBetweenOnAxis(fromNode.pos, toNode.pos, splitPos)) {
    throw new Error(
      `Split position [${splitPos.join(",")}] is not strictly between endpoints of edge "${edgeId}".`
    );
  }

  const existingNode = graph.nodes.find((n) => samePos(n.pos, splitPos));
  let workingNodes = [...graph.nodes];
  let splitNode: DrawNode;

  if (existingNode) {
    splitNode = existingNode;
  } else {
    splitNode = {
      id: nextNodeId(graph, "f"),
      pos: [...splitPos] as Vec3,
      kind: "fitting",
      fittingType:
        junctionFitting ??
        (edge.system === "dwv" && isHorizontalAxis(edge.axis) ? "wye" : "tee"),
    };
    workingNodes.push(splitNode);
  }

  const len1 = manhattanGridLength(fromNode.pos, splitNode.pos);
  const len2 = manhattanGridLength(splitNode.pos, toNode.pos);

  const e1: DrawEdge = {
    ...edge,
    id: `${edge.id}-a`,
    from: edge.from,
    to: splitNode.id,
    length: len1,
  };
  const e2: DrawEdge = {
    ...edge,
    id: `${edge.id}-b`,
    from: splitNode.id,
    to: edge.to,
    length: len2,
  };

  // Guarantee unique edge IDs even across repeated splits
  const usedIds = new Set(
    graph.edges.filter((e) => e.id !== edgeId).map((e) => e.id)
  );
  if (usedIds.has(e1.id)) e1.id = `${nextEdgeId(graph)}-a`;
  usedIds.add(e1.id);
  if (usedIds.has(e2.id)) e2.id = `${nextEdgeId(graph)}-b`;

  const remainingEdges = graph.edges.filter((e) => e.id !== edgeId);
  return {
    graph: {
      nodes: workingNodes,
      edges: [...remainingEdges, e1, e2],
    },
    splitNode,
    edges: [e1, e2],
  };
}

export function connect(
  graph: DrawGraph,
  fromNodeId: string,
  toNodeId: string,
  options: {
    size?: number | null;
    system: DrawPipeSystem;
    slope?: number | null;
    slopeToward?: "from" | "to";
    overrideFittingFrom?: FittingType;
    overrideFittingTo?: FittingType;
  }
): { graph: DrawGraph; addedEdges: DrawEdge[] } {
  const fromNode = graph.nodes.find((n) => n.id === fromNodeId);
  const toNode = graph.nodes.find((n) => n.id === toNodeId);
  if (!fromNode || !toNode) {
    throw new Error("Both endpoints must exist in graph to connect.");
  }
  if (fromNodeId === toNodeId) {
    throw new Error("Cannot connect a node to itself.");
  }

  const axis = inferAxisBetween(fromNode.pos, toNode.pos);
  if (!axis) {
    throw new Error(
      `Nodes ${fromNodeId} and ${toNodeId} are not aligned on a single isometric axis.`
    );
  }

  // Chain cleanly through any existing collinear interior nodes so edges never overlap
  const interiorNodes = graph.nodes
    .filter(
      (n) =>
        n.id !== fromNodeId &&
        n.id !== toNodeId &&
        isStrictlyBetweenOnAxis(fromNode.pos, toNode.pos, n.pos)
    )
    .sort(
      (a, b) =>
        manhattanGridLength(fromNode.pos, a.pos) -
        manhattanGridLength(fromNode.pos, b.pos)
    );

  const chain = [fromNode, ...interiorNodes, toNode];
  let workingGraph = graph;
  const addedEdges: DrawEdge[] = [];

  for (let i = 0; i < chain.length - 1; i += 1) {
    const a = chain[i];
    const b = chain[i + 1];
    const pair = edgePairKey(a.id, b.id);
    const alreadyConnected = workingGraph.edges.some(
      (e) => edgePairKey(e.from, e.to) === pair
    );
    if (alreadyConnected) continue;

    const segAxis = inferAxisBetween(a.pos, b.pos);
    if (!segAxis) continue;

    const segEdge: DrawEdge = {
      id: nextEdgeId(workingGraph),
      from: a.id,
      to: b.id,
      axis: segAxis,
      length: manhattanGridLength(a.pos, b.pos),
      size: options.size ?? null,
      system: options.system,
      slope: options.slope ?? null,
      slopeToward: options.slopeToward,
    };

    workingGraph = {
      ...workingGraph,
      edges: [...workingGraph.edges, segEdge],
    };
    addedEdges.push(segEdge);

    workingGraph = applyAutoFittingAtNode(
      workingGraph,
      a.id,
      segEdge,
      i === 0 ? options.overrideFittingFrom : undefined
    );
    workingGraph = applyAutoFittingAtNode(
      workingGraph,
      b.id,
      segEdge,
      i === chain.length - 2 ? options.overrideFittingTo : undefined
    );
  }

  return { graph: workingGraph, addedEdges };
}

export interface AddRunParams {
  fromNodeId?: string;
  fromPos?: Vec3;
  axis: IsoAxis;
  length: number;
  size?: number | null;
  system: DrawPipeSystem;
  slope?: number | null;
  slopeToward?: "from" | "to";
  overrideFitting?: FittingType;
}

export function addRun(
  graph: DrawGraph,
  params: AddRunParams
): { graph: DrawGraph; startNode: DrawNode; endNode: DrawNode; edges: DrawEdge[] } {
  if (!Number.isInteger(params.length) || params.length < 1) {
    throw new Error(`Pipe run length must be an integer >= 1 (got ${params.length}).`);
  }

  let workingGraph = graph;
  let startNode: DrawNode;

  if (params.fromNodeId) {
    const found = workingGraph.nodes.find((n) => n.id === params.fromNodeId);
    if (!found) {
      throw new Error(`Start node "${params.fromNodeId}" not found.`);
    }
    startNode = found;
  } else if (params.fromPos) {
    const placed = placeNode(workingGraph, {
      pos: params.fromPos,
      kind: "fitting",
      fittingType: params.overrideFitting ?? "elbow_90",
    });
    workingGraph = placed.graph;
    startNode = placed.node;
  } else {
    throw new Error("addRun requires either fromNodeId or fromPos.");
  }

  const endPos = addScaledVec(
    startNode.pos,
    axisUnitVector(params.axis),
    params.length
  );

  let endNode = workingGraph.nodes.find((n) => samePos(n.pos, endPos));
  if (!endNode) {
    const placedEnd = placeNode(workingGraph, {
      pos: endPos,
      kind: "fitting",
      fittingType: params.overrideFitting ?? "elbow_90",
    });
    workingGraph = placedEnd.graph;
    endNode = placedEnd.node;
  }

  const connected = connect(workingGraph, startNode.id, endNode.id, {
    size: params.size ?? null,
    system: params.system,
    slope: params.slope ?? null,
    slopeToward: params.slopeToward,
    overrideFittingFrom: params.overrideFitting,
  });

  const refreshedStart =
    connected.graph.nodes.find((n) => n.id === startNode.id) ?? startNode;
  const refreshedEnd =
    connected.graph.nodes.find((n) => n.id === endNode!.id) ?? endNode;

  return {
    graph: connected.graph,
    startNode: refreshedStart,
    endNode: refreshedEnd,
    edges: connected.addedEdges,
  };
}

export function updateEdgeLabel(
  graph: DrawGraph,
  edgeId: string,
  size: number | null
): DrawGraph {
  return {
    ...graph,
    edges: graph.edges.map((e) => (e.id === edgeId ? { ...e, size } : e)),
  };
}

export function updateEdgeSlope(
  graph: DrawGraph,
  edgeId: string,
  slope: number | null,
  slopeToward?: "from" | "to"
): DrawGraph {
  return {
    ...graph,
    edges: graph.edges.map((e) =>
      e.id === edgeId
        ? { ...e, slope, slopeToward: slopeToward ?? e.slopeToward }
        : e
    ),
  };
}

export function removeEdge(graph: DrawGraph, edgeId: string): DrawGraph {
  return {
    ...graph,
    edges: graph.edges.filter((e) => e.id !== edgeId),
  };
}

export function removeNode(graph: DrawGraph, nodeId: string): DrawGraph {
  return {
    nodes: graph.nodes.filter((n) => n.id !== nodeId),
    edges: graph.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
  };
}

export function validateGraph(graph: DrawGraph): GraphValidationResult {
  const errors: string[] = [];
  const parsed = drawGraphSchema.safeParse(graph);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`
      ),
    };
  }

  const nodeIds = new Set<string>();
  const positions = new Set<string>();
  const nodeById = new Map<string, DrawNode>();

  for (const node of parsed.data.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node ID "${node.id}".`);
    }
    nodeIds.add(node.id);
    nodeById.set(node.id, node);

    const pk = posKey(node.pos);
    if (positions.has(pk)) {
      errors.push(`Duplicate node position [${pk}].`);
    }
    positions.add(pk);
  }

  const edgeIds = new Set<string>();
  const edgePairs = new Set<string>();

  for (const edge of parsed.data.edges) {
    if (edgeIds.has(edge.id)) {
      errors.push(`Duplicate edge ID "${edge.id}".`);
    }
    edgeIds.add(edge.id);

    if (edge.from === edge.to) {
      errors.push(`Self-loop edge "${edge.id}" on node "${edge.from}".`);
    }

    const fromNode = nodeById.get(edge.from);
    const toNode = nodeById.get(edge.to);
    if (!fromNode || !toNode) {
      errors.push(`Edge "${edge.id}" references missing endpoint(s).`);
      continue;
    }

    const pair = edgePairKey(edge.from, edge.to);
    if (edgePairs.has(pair)) {
      errors.push(`Duplicate edge connecting ${edge.from} and ${edge.to}.`);
    }
    edgePairs.add(pair);

    const inferredAxis = inferAxisBetween(fromNode.pos, toNode.pos);
    if (inferredAxis !== edge.axis) {
      errors.push(
        `Edge "${edge.id}" axis "${edge.axis}" mismatches endpoint vector (${inferredAxis ?? "non-axial"}).`
      );
    }

    const actualLength = manhattanGridLength(fromNode.pos, toNode.pos);
    if (actualLength !== edge.length) {
      errors.push(
        `Edge "${edge.id}" length ${edge.length} mismatches grid distance ${actualLength}.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function serialize(graph: DrawGraph): string {
  const canonical = drawGraphSchema.parse({
    nodes: [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...graph.edges].sort((a, b) => a.id.localeCompare(b.id)),
  });
  return JSON.stringify(canonical);
}

export function deserialize(raw: string): DrawGraph {
  const parsed = drawGraphSchema.parse(JSON.parse(raw));
  const check = validateGraph(parsed);
  if (!check.valid) {
    throw new Error(`Invalid serialized DrawGraph: ${check.errors.join("; ")}`);
  }
  return parsed;
}
