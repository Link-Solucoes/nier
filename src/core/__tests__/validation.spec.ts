import { describe, expect, it } from "vitest";
import { coreRegistry, createComparator, createRegistry, mergeRegistry } from "../../registry/registry";
import { buildIndices } from "../indices";
import type { Automation } from "../types";
import { validateAutomation } from "../validation";

describe("validateAutomation", () => {
	const registry = mergeRegistry(
		coreRegistry,
		createRegistry({
			comparators: [
				createComparator({
					id: "EXISTS",
					arity: 1,
					eval: async ([a]) => a !== undefined && a !== null,
				}),
			],
		}),
	);

	it("validates ok flow", () => {
		const automation: Automation = {
			meta: { id: "a1", name: "ok" },
			rootNodeId: "n1",
			graph: {
				nodes: [
					{ id: "n1", type: "action", action: { kind: "noop" } },
					{
						id: "n2",
						type: "decision",
						branches: [
							{
								id: "b1",
								to: "end",
								condition: {
									root: {
										type: "condition",
										comparator: "EXISTS",
										left: { kind: "const", value: 1 },
									},
								},
							},
						],
					},
					{ id: "end", type: "end" },
				],
				edges: [{ id: "e1", from: "n1", to: "n2" }],
			},
			triggers: [],
		};
		const res = validateAutomation({
			automation,
			registry,
			indices: buildIndices(automation.graph),
		});
		expect(res.valid).toBe(true);
		expect(res.summary.errors).toBe(0);
	});

	it("detects unreachable and duplicates", () => {
		const automation: Automation = {
			meta: { id: "a2", name: "bad" },
			rootNodeId: "root",
			graph: {
				nodes: [
					{ id: "root", type: "end" },
					{ id: "root", type: "end" },
					{ id: "iso", type: "end" },
				],
				edges: [],
			},
			triggers: [],
		};
		const res = validateAutomation({ automation, registry });
		expect(res.valid).toBe(false);
		expect(res.summary.errors).toBeGreaterThan(0);
	});
});
