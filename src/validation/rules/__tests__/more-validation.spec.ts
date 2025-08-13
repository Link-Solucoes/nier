import { describe, expect, it } from "vitest";
import type { Automation } from "../../../core/types";
import {
	listDefaultValidationRules,
	validateAutomation,
} from "../../../core/validation";
import { coreRegistry } from "../../../registry/registry";

describe("more validation rules", () => {
	it("failFast stops at first error", () => {
		const automation: Automation = {
			meta: { id: "ff", name: "ff" },
			rootNodeId: "missing",
			graph: {
				nodes: [{ id: "a", type: "end" }],
				edges: [{ id: "e1", from: "a", to: "ghost" }],
			},
			triggers: [],
		};
		const res = validateAutomation({
			automation,
			registry: coreRegistry,
			options: { failFast: true },
		});
		expect(res.summary.errors).toBeGreaterThan(0);
	});

	it("edges to unknown nodes produce errors", () => {
		const automation: Automation = {
			meta: { id: "edge-miss", name: "edge-miss" },
			rootNodeId: "a",
			graph: {
				nodes: [{ id: "a", type: "end" }],
				edges: [{ id: "e1", from: "a", to: "ghost" }],
			},
			triggers: [],
		};
		const res = validateAutomation({ automation, registry: coreRegistry });
		expect(res.valid).toBe(false);
	});

	it("decision with no conditions flagged", () => {
		const automation: Automation = {
			meta: { id: "d0", name: "d0" },
			rootNodeId: "d",
			graph: {
				nodes: [
					{
						id: "d",
						type: "decision",
						branches: [{ id: "b1", to: "end" }],
					},
					{ id: "end", type: "end" },
				],
			},
			triggers: [],
		};
		const res = validateAutomation({ automation, registry: coreRegistry });
		expect(res.valid).toBe(false);
	});

	it("unknown comparator in trigger and edge condition", () => {
		const automation: Automation = {
			meta: { id: "unk", name: "unk" },
			rootNodeId: "a",
			graph: {
				nodes: [
					{ id: "a", type: "end" },
					{ id: "b", type: "end" },
				],
				edges: [
					{
						id: "e1",
						from: "a",
						to: "b",
						condition: {
							root: {
								type: "condition",
								comparator: "NOPE",
								left: { kind: "const", value: 1 },
							},
						},
					},
				],
			},
			triggers: [
				{
					id: "t",
					event: "x",
					filter: {
						type: "condition",
						comparator: "ZZZ",
						left: { kind: "const", value: 1 },
					},
				},
			],
		};
		const res = validateAutomation({ automation, registry: coreRegistry });
		expect(res.valid).toBe(false);
	});

	it("list default rules names", () => {
		const names = listDefaultValidationRules();
		expect(Array.isArray(names)).toBe(true);
		expect(names.length).toBeGreaterThan(0);
	});
});
