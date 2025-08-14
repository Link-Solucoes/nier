import { describe, expect, it } from "vitest";
import { buildIndices } from "../indices";
import type { Graph } from "../types";

describe("buildIndices", () => {
	it("builds adjacency and degree indices including implicit edges", () => {
		const graph: Graph = {
			nodes: [
				{ id: "a", type: "action", action: { kind: "noop" } },
				{
					id: "d",
					type: "decision",
					branches: [
						{
							id: "b1",
							to: "w",
							condition: {
								root: {
									type: "condition",
									comparator: "EXISTS",
									left: { kind: "const", value: 1 },
								},
							},
						},
					],
					defaultTo: "p",
				},
				{
					id: "w",
					type: "wait",
					wait: { kind: "duration", durationMs: 10 },
					to: "e",
				},
				{
					id: "p",
					type: "parallel",
					branches: [
						{ id: "x", start: "x1" },
						{ id: "y", start: "y1" },
					],
					to: "e",
				},
				{ id: "x1", type: "action", action: { kind: "noop" } },
				{ id: "y1", type: "action", action: { kind: "noop" } },
				{ id: "e", type: "end" },
			],
			edges: [{ id: "e1", from: "a", to: "d" }],
		};
		const idx = buildIndices(graph);
		// explicit
		expect(idx.outgoing.a).toEqual(["d"]);
		expect(idx.incoming.d).toContain("a");
		// decision implicit to branches + default
		expect(idx.outgoing.d).toEqual(["w", "p"]);
		// wait implicit to
		expect(idx.outgoing.w).toEqual(["e"]);
		// parallel implicit to branches + join to
		expect(idx.outgoing.p).toEqual(["x1", "y1", "e"]);
		// degrees
		expect(idx.inDegree.e).toBeGreaterThan(0);
		expect(idx.outDegree.p).toBe(3);
	});
});
