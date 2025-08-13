import { describe, expect, it } from "vitest";
import type { Automation } from "../../../core/types";
import { validateAutomation } from "../../../core/validation";
import { coreRegistry } from "../../../registry/registry";

describe("validation edge cases", () => {
	it("invalid throttle and wait config detected", () => {
		const automation: Automation = {
			meta: { id: "v1", name: "v" },
			rootNodeId: "a",
			graph: {
				nodes: [
					{
						id: "a",
						type: "wait",
						wait: { kind: "duration", durationMs: 0 },
						to: "e",
					},
					{
						id: "p",
						type: "parallel",
						branches: [{ id: "1", start: "x" }],
					},
					{ id: "e", type: "end" },
					{ id: "x", type: "end" },
				],
			},
			triggers: [
				{
					id: "t",
					event: "e",
					throttle: { intervalMs: 0, maxInInterval: 0 },
				},
			],
		};
		const res = validateAutomation({ automation, registry: coreRegistry });
		expect(res.valid).toBe(false);
		expect(res.summary.errors).toBeGreaterThan(0);
	});

	it("detects cycles", () => {
		const automation: Automation = {
			meta: { id: "v2", name: "v2" },
			rootNodeId: "a",
			graph: {
				nodes: [{ id: "a", type: "action", action: { kind: "noop" } }],
				edges: [{ id: "e1", from: "a", to: "a" }],
			},
			triggers: [],
		};
		const res = validateAutomation({ automation, registry: coreRegistry });
		expect(res.valid).toBe(false);
		expect(res.summary.errors).toBeGreaterThan(0);
	});
});
