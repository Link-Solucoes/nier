import { describe, expect, it, vi } from "vitest";
import type { Automation } from "../../core/types";
import { coreRegistry } from "../../registry/registry";
import { createEngine } from "../engine";
import { InlineSchedulerAdapter } from "../scheduler";
import { InMemoryExecutionStore } from "../store/in-memory";
import type { EngineEvent } from "../types";

function setup(automation: Automation) {
	const store = new InMemoryExecutionStore();
	const onEvent = vi.fn();
	const engine = createEngine({
		runtime: { registry: coreRegistry, onEvent, store },
		scheduler: new InlineSchedulerAdapter({
			onFlowJob: async () => {},
			onNodeJob: async ({ executionId, nodeId }) => {
				await engine.handleNodeJob({ automation, executionId, nodeId });
			},
		}),
	});
	return { engine, onEvent };
}

describe("parallel strategies", () => {
	it("waitAny fires after first branch completes", async () => {
		const automation: Automation = {
			meta: { id: "p-any", name: "p-any" },
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
						join: { strategy: "waitAny" },
						to: "end",
					},
					{ id: "a1", type: "end" },
					{ id: "b1", type: "end" },
					{ id: "end", type: "end" },
				],
			},
			triggers: [],
		};
		const { engine, onEvent } = setup(automation);
		await engine.startFlowPerNode({ automation, executionId: "x1" });
		const events: EngineEvent[] = onEvent.mock.calls.map((c) => c[0]);
		// ensure end is reached due to waitAny after first branch
		expect(events.some((e) => e.type === "nodeCompleted" && e.nodeId === "end")).toBe(true);
	});

	it("count fires when completed >= count", async () => {
		const automation: Automation = {
			meta: { id: "p-count", name: "p-count" },
			rootNodeId: "p",
			graph: {
				nodes: [
					{
						id: "p",
						type: "parallel",
						branches: [
							{ id: "a", start: "a1" },
							{ id: "b", start: "b1" },
							{ id: "c", start: "c1" },
						],
						join: { strategy: "count", count: 2 },
						to: "end",
					},
					{ id: "a1", type: "end" },
					{ id: "b1", type: "end" },
					{ id: "c1", type: "end" },
					{ id: "end", type: "end" },
				],
			},
			triggers: [],
		};
		const { engine, onEvent } = setup(automation);
		await engine.startFlowPerNode({ automation, executionId: "x2" });
		const events: EngineEvent[] = onEvent.mock.calls.map((c) => c[0]);
		// end should be scheduled once after 2 branches complete
		const endEvents = events.filter((e) => e.type === "nodeCompleted" && e.nodeId === "end");
		expect(endEvents.length).toBe(1);
	});
});
