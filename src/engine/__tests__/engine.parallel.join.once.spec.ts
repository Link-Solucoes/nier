import { describe, expect, it, vi } from "vitest";
import type { Automation } from "../../core/types";
import { coreRegistry } from "../../registry/registry";
import { createEngine } from "../engine";
import { InlineSchedulerAdapter } from "../scheduler";
import { InMemoryExecutionStore } from "../store/in-memory";
import type { EngineEvent } from "../types";

/** Ensure waitAll join fires only once even if additional branch completions occur later. */
describe("parallel join fires only once", () => {
	it("emits continuation to 'to' a single time for waitAll", async () => {
		const automation: Automation = {
			meta: { id: "p-join-once", name: "p-join-once" },
			rootNodeId: "p",
			graph: {
				nodes: [
					{
						id: "p",
						type: "parallel",
						branches: [
							{ id: "a", start: "a1" },
							{ id: "b", start: "b1" },
						],
						to: "end",
						join: { strategy: "waitAll" },
					},
					{ id: "a1", type: "end" },
					{ id: "b1", type: "end" },
					{ id: "end", type: "end" },
				],
			},
			triggers: [],
		};

		const store = new InMemoryExecutionStore();
		const onEvent = vi.fn();
		const engine = createEngine({
			runtime: { registry: coreRegistry, onEvent, store },
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

		await engine.startFlowPerNode({ automation, executionId: "pj1" });
		const events: EngineEvent[] = onEvent.mock.calls.map((c) => c[0]);
		const endCompleted = events.filter((e) => e.type === "nodeCompleted" && e.nodeId === "end");
		expect(endCompleted.length).toBe(1);
	});
});
