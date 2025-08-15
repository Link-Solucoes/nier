import { describe, expect, it } from "vitest";
import type { Automation } from "../../core/types";
import { coreRegistry } from "../../registry/registry";
import { createEngine } from "../engine";
import { InlineSchedulerAdapter } from "../scheduler";
import { InMemoryExecutionStore } from "../store/in-memory";

describe("engine history option", () => {
	it("records node and flow events when enableHistory is true", async () => {
		const automation: Automation = {
			meta: { id: "h1", name: "history" },
			rootNodeId: "a1",
			graph: {
				nodes: [
					{ id: "a1", type: "action", action: { kind: "noop" } },
					{ id: "end", type: "end" },
				],
				edges: [{ id: "e1", from: "a1", to: "end" }],
			},
			triggers: [],
		};

		const store = new InMemoryExecutionStore();
		const engine = createEngine({
			runtime: {
				registry: coreRegistry,
				store,
				options: { enableHistory: true },
			},
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

		const executionId = "hist-1";
		await engine.startFlowPerNode({ automation, executionId });
		const state = await store.load(executionId);
		expect(state).toBeTruthy();
		expect(Array.isArray(state?.history)).toBe(true);
		// Should have at least scheduled and completed events
		const types = (state?.history ?? []).map((h) => h.type);
		expect(types).toEqual(expect.arrayContaining(["nodeScheduled", "nodeCompleted", "flowCompleted"]));
	});
});
