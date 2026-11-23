import { describe, expect, it } from "vitest";
import fixtures from "../fixtures/rules.fixtures.json";
import {
  type DrawGraph,
  type DrawPipeSystem,
  type DrawingExerciseConfig,
  type DrawingRuleRow,
  ISO_AXES,
  type IsoAxis,
  type Vec3,
  addRun,
  connect,
  createEmptyGraph,
  deserialize,
  gradeDrawing,
  isoToScreen,
  manhattanGridLength,
  placeNode,
  screenToIsoSnap,
  serialize,
  splitEdge,
  validateGraph,
} from "../index";

function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const RUBRIC = {
  connectivity: 20,
  trap_present: 15,
  vent_reaches_terminal: 15,
  fitting_appropriateness: 15,
  slope_direction: 15,
  sizing_labels: 10,
  no_dead_ends: 10,
};

function makeTestExercise(
  overrides: Partial<DrawingExerciseConfig> = {}
): DrawingExerciseConfig {
  return {
    id: "test-ex-1",
    jurisdiction_id: "test-jur-1",
    title: "Synthetic Fixture Exercise",
    prompt_md: "Synthetic grading validation test.",
    fixtures: [],
    pipe_system: "dwv",
    constraints: {},
    scoring_rubric: RUBRIC,
    status: "published",
    code_family: "IPC",
    edition: "SYNTHETIC-TEST-1",
    ...overrides,
  };
}

describe("iso projection", () => {
  it("round-trips 3D grid coordinates through screenToIsoSnap", () => {
    const samples: Vec3[] = [
      [0, 0, 0],
      [3, -2, 0],
      [-4, 5, 2],
      [6, 1, -3],
      [-1, -6, 4],
    ];
    for (const pos of samples) {
      const screen = isoToScreen(pos);
      const snapped = screenToIsoSnap(screen.x, screen.y, pos[2]);
      expect(snapped).toEqual(pos);
    }
  });
});

describe("graph invariants (property tests)", () => {
  it("preserves validateGraph invariants and lossless serialization across 50 random build sequences", () => {
    const systems: DrawPipeSystem[] = ["dwv", "vent", "supply"];

    for (let trial = 0; trial < 50; trial += 1) {
      const rand = makeRng(1000 + trial);
      let graph = createEmptyGraph();

      const placedStart = placeNode(graph, {
        pos: [0, 0, 0],
        kind: "fixture",
        fixtureType: "lav",
        hasTrap: true,
      });
      graph = placedStart.graph;

      for (let step = 0; step < 8; step += 1) {
        const nodes = graph.nodes;
        const start = nodes[Math.floor(rand() * nodes.length)];
        const axis = ISO_AXES[Math.floor(rand() * ISO_AXES.length)];
        const length = 1 + Math.floor(rand() * 4);
        const system = systems[Math.floor(rand() * systems.length)];
        const size = system === "supply" ? 0.75 : system === "vent" ? 1.5 : 2;
        const slope =
          system === "dwv" && axis !== "z" && axis !== "-z" ? 0.25 : null;

        const res = addRun(graph, {
          fromNodeId: start.id,
          axis,
          length,
          size,
          system,
          slope,
          slopeToward: "to",
        });
        graph = res.graph;

        const check = validateGraph(graph);
        expect(check.valid).toBe(true);
        expect(check.errors).toEqual([]);

        const roundTrip = deserialize(serialize(graph));
        expect(serialize(roundTrip)).toBe(serialize(graph));
      }

      // Verify pairwise distinct node positions and exact edge geometry
      const posSet = new Set(graph.nodes.map((n) => n.pos.join(",")));
      expect(posSet.size).toBe(graph.nodes.length);

      for (const edge of graph.edges) {
        const from = graph.nodes.find((n) => n.id === edge.from)!;
        const to = graph.nodes.find((n) => n.id === edge.to)!;
        expect(edge.length).toBe(manhattanGridLength(from.pos, to.pos));
      }
    }
  });

  it("conserves total edge length across splitEdge on every isometric axis", () => {
    const axisDeltas: Record<IsoAxis, Vec3> = {
      x: [1, 0, 0],
      "-x": [-1, 0, 0],
      y: [0, 1, 0],
      "-y": [0, -1, 0],
      z: [0, 0, 1],
      "-z": [0, 0, -1],
    };

    for (const axis of ISO_AXES) {
      for (const totalLen of [2, 3, 5]) {
        const init = addRun(createEmptyGraph(), {
          fromPos: [0, 0, 0],
          axis,
          length: totalLen,
          size: 2,
          system: "dwv",
          slope: axis === "z" || axis === "-z" ? null : 0.25,
          slopeToward: "to",
        });

        const origEdge = init.edges[0];
        const d = axisDeltas[axis];
        const splitPos: Vec3 = [d[0], d[1], d[2]];
        const splitRes = splitEdge(init.graph, origEdge.id, splitPos);

        expect(splitRes.graph.nodes.length).toBe(init.graph.nodes.length + 1);
        expect(splitRes.edges[0].length + splitRes.edges[1].length).toBe(
          origEdge.length
        );
        expect(validateGraph(splitRes.graph).valid).toBe(true);
      }
    }
  });

  it("connects collinear interior nodes without creating parallel edges and honors fitting override", () => {
    let g = createEmptyGraph();
    const a = placeNode(g, { pos: [0, 0, 0], kind: "fixture", fixtureType: "lav", hasTrap: true });
    g = a.graph;
    const mid = placeNode(g, { pos: [2, 0, 0], kind: "fitting", fittingType: "elbow_90" });
    g = mid.graph;
    const b = placeNode(g, { pos: [5, 0, 0], kind: "stack" });
    g = b.graph;

    const conn = connect(g, a.node.id, b.node.id, {
      size: 2,
      system: "dwv",
      slope: 0.25,
      slopeToward: "to",
      overrideFittingFrom: "cleanout",
    });

    expect(conn.addedEdges).toHaveLength(2);
    expect(conn.addedEdges[0].length + conn.addedEdges[1].length).toBe(5);
    expect(validateGraph(conn.graph).valid).toBe(true);
  });
});

describe("gradeDrawing deterministic rule engine", () => {
  const syntheticRules = fixtures.synthetic_rules as DrawingRuleRow[];

  it.each(fixtures.cases)("$name", (testCase) => {
    const graph = testCase.graph as DrawGraph;
    const exercise = makeTestExercise();

    const result = gradeDrawing({
      graph,
      exercise,
      rules: syntheticRules,
    });

    expect(result.score).toBe(testCase.expectedScore);
    expect(result.max).toBe(testCase.expectedMax);

    for (const ruleKey of testCase.expectedPassedRules) {
      const item = result.breakdown.find((b) => b.rule_key === ruleKey);
      expect(item?.configured).toBe(true);
      expect(item?.passed).toBe(true);
    }

    for (const ruleKey of testCase.expectedFailedRules) {
      const item = result.breakdown.find((b) => b.rule_key === ruleKey);
      expect(item?.configured).toBe(true);
      expect(item?.passed).toBe(false);
    }

    if (testCase.expectedOffendingForRule) {
      for (const [ruleKey, expectedIds] of Object.entries(
        testCase.expectedOffendingForRule
      )) {
        const item = result.breakdown.find((b) => b.rule_key === ruleKey);
        for (const id of expectedIds) {
          expect(item?.offending_node_ids).toContain(id);
        }
      }
    }
  });

  it("permits dead-end cleanout when listed in permitted_dead_end_fittings", () => {
    const validBase = fixtures.cases[0].graph as DrawGraph;
    const withCleanout: DrawGraph = {
      nodes: [
        ...validBase.nodes,
        { id: "co-1", pos: [2, -2, 0], kind: "fitting", fittingType: "cleanout" },
      ],
      edges: [
        ...validBase.edges,
        {
          id: "e-co",
          from: "co-1",
          to: "j-1",
          axis: "y",
          length: 2,
          size: 2,
          system: "dwv",
          slope: 0.25,
          slopeToward: "to",
        },
      ],
    };

    const result = gradeDrawing({
      graph: withCleanout,
      exercise: makeTestExercise(),
      rules: syntheticRules,
    });

    const deadEndRule = result.breakdown.find((b) => b.rule_key === "no_dead_ends");
    expect(deadEndRule?.passed).toBe(true);
    expect(deadEndRule?.offending_node_ids).toEqual([]);
  });

  it("marks missing rules and null params as 'Not configured' and excludes them from max", () => {
    const validBase = fixtures.cases[0].graph as DrawGraph;

    // 1. Completely empty rules => max === 0, every rule configured === false
    const noRulesRes = gradeDrawing({
      graph: validBase,
      exercise: makeTestExercise(),
      rules: [],
    });
    expect(noRulesRes.score).toBe(0);
    expect(noRulesRes.max).toBe(0);
    expect(noRulesRes.breakdown.every((b) => !b.configured && b.max_points === 0)).toBe(
      true
    );
    expect(
      noRulesRes.breakdown.every((b) => b.message.startsWith("Not configured"))
    ).toBe(true);

    // 2. Partial rules with explicit null params => only valid params contribute to max
    const nullParamRules: DrawingRuleRow[] = [
      {
        code_family: "IPC",
        edition: "SYNTHETIC-TEST-1",
        rule_key: "connectivity",
        description_paraphrased: "Conn",
        params: { require_connected_fixtures: true },
        code_ref: "SYNTH-1",
      },
      {
        code_family: "IPC",
        edition: "SYNTHETIC-TEST-1",
        rule_key: "slope_direction",
        description_paraphrased: "Slope",
        params: { min_slope_in_per_ft: null },
        code_ref: "SYNTH-2",
      },
      {
        code_family: "IPC",
        edition: "SYNTHETIC-TEST-1",
        rule_key: "sizing_labels",
        description_paraphrased: "Size",
        params: { min_size_by_system: null },
        code_ref: "SYNTH-3",
      },
    ];

    const partialRes = gradeDrawing({
      graph: validBase,
      exercise: makeTestExercise({
        scoring_rubric: {
          connectivity: 20,
          slope_direction: 15,
          sizing_labels: 10,
        },
      }),
      rules: nullParamRules,
    });

    expect(partialRes.max).toBe(20);
    expect(partialRes.score).toBe(20);
    expect(
      partialRes.breakdown.find((b) => b.rule_key === "slope_direction")?.configured
    ).toBe(false);
    expect(
      partialRes.breakdown.find((b) => b.rule_key === "sizing_labels")?.configured
    ).toBe(false);
  });
});
