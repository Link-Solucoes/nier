import { describe, expect, it, vi } from "vitest";
import type { Automation } from "../../core/types";
import { coreRegistry } from "../../registry/registry";
import { createEngine } from "../engine";
import { InlineSchedulerAdapter } from "../scheduler";
import type { EngineEvent } from "../types";

/** When an action has no outgoing edges, flow should complete (if no joins pending). */
describe("engine action without edges", () => {
	it("completes flow when no next nodes", async () => {
		const automation: Automation = {
			meta: { id: "no-edges", name: "no-edges" },
			rootNodeId: "a",
			graph: {
				nodes: [{ id: "a", type: "action", action: { kind: "noop" } }],
			},
			triggers: [],
		};

		const onEvent = vi.fn();
		const engine = createEngine({
			runtime: { registry: coreRegistry, onEvent },
			scheduler: new InlineSchedulerAdapter({
				onFlowJob: async () => {},
				onNodeJob: async ({ executionId, nodeId }) => {
					await engine.handleNodeJob({
						automation,
						executionId,
						nodeId,
					});
				},
			}),
		});

		await engine.startFlowPerNode({ automation, executionId: "ne1" });
		const events: EngineEvent[] = onEvent.mock.calls.map((c) => c[0]);
		expect(events.some((e) => e.type === "nodeCompleted" && e.nodeId === "a")).toBe(true);
		expect(events.some((e) => e.type === "flowCompleted")).toBe(true);
	});
});
