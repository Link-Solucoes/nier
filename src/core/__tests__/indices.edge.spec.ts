import { describe, expect, it } from "vitest";
import { buildIndices } from "../indices";
import type { Graph } from "../types";

describe("indices edge cases", () => {
	it("nodes without edges have zero degrees", () => {
		const graph: Graph = {
			nodes: [
				{ id: "a", type: "end" },
				{ id: "b", type: "end" },
			],
		};
		const idx = buildIndices(graph);
		expect(idx.outDegree.a).toBe(0);
		expect(idx.inDegree.a).toBe(0);
		expect(idx.outDegree.b).toBe(0);
		expect(idx.inDegree.b).toBe(0);
	});
});
