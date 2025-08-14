import { describe, expect, it, vi } from "vitest";
import type { Automation } from "../../core/types";
import { coreRegistry, createComparator, createRegistry, mergeRegistry } from "../../registry/registry";
import { createEngine } from "../engine";
import { InlineSchedulerAdapter } from "../scheduler";
import type { EngineEvent } from "../types";

function makeEngine(registry = coreRegistry, automation: Automation) {
	const onEvent = vi.fn();
	const engine = createEngine({
		runtime: { registry, onEvent },
		scheduler: new InlineSchedulerAdapter({
			onFlowJob: async () => {},
			onNodeJob: async ({ executionId, nodeId }) => {
				await engine.handleNodeJob({ automation, executionId, nodeId });
			},
		}),
	});
	return { engine, onEvent };
}

describe("engine edges conditions", () => {
	const TRUE = createComparator({
		id: "TRUE",
		arity: 1,
		eval: async () => true,
	});
	const registry = mergeRegistry(coreRegistry, createRegistry({ comparators: [TRUE] }));

	it("schedules only edges whose condition is true and emits edgeMultiMatch when >1", async () => {
		const automation: Automation = {
			meta: { id: "a", name: "edges" },
			rootNodeId: "a1",
			graph: {
				nodes: [
					{ id: "a1", type: "action", action: { kind: "noop" } },
					{ id: "x", type: "end" },
					{ id: "y", type: "end" },
				],
				edges: [
					{
						id: "e1",
						from: "a1",
						to: "x",
						condition: {
							root: {
								type: "condition",
								comparator: "TRUE",
								left: { kind: "const", value: 1 },
							},
						},
					},
					{
						id: "e2",
						from: "a1",
						to: "y",
						condition: {
							root: {
								type: "condition",
								comparator: "TRUE",
								left: { kind: "const", value: 2 },
							},
						},
					},
				],
			},
			triggers: [],
		};
		const { engine, onEvent } = makeEngine(registry, automation);
		await engine.startFlowPerNode({ automation, executionId: "ex" });
		const events: EngineEvent[] = onEvent.mock.calls.map((c) => c[0]);
		const mm = events.find((e) => e.type === "edgeMultiMatch");
		expect(mm).toBeTruthy();
		// both end nodes should be completed due to two edges passing
		const completed = events.filter((e) => e.type === "nodeCompleted");
		const ids = completed.map((e) => (e.type === "nodeCompleted" ? e.nodeId : ""));
		expect(ids).toContain("x");
		expect(ids).toContain("y");
	});

	it("schedules none if no edge condition passes", async () => {
		const FALSE = createComparator({
			id: "FALSE",
			arity: 1,
			eval: async () => false,
		});
		const reg = mergeRegistry(registry, createRegistry({ comparators: [FALSE] }));
		const automation: Automation = {
			meta: { id: "a2", name: "edges2" },
			rootNodeId: "a1",
			graph: {
				nodes: [
					{ id: "a1", type: "action", action: { kind: "noop" } },
					{ id: "x", type: "end" },
				],
				edges: [
					{
						id: "e1",
						from: "a1",
						to: "x",
						condition: {
							root: {
								type: "condition",
								comparator: "FALSE",
								left: { kind: "const", value: 1 },
							},
						},
					},
				],
			},
			triggers: [],
		};
		const { engine, onEvent } = makeEngine(reg, automation);
		await engine.startFlowPerNode({ automation, executionId: "ex2" });
		const events: EngineEvent[] = onEvent.mock.calls.map((c) => c[0]);
		const completed = events.filter((e) => e.type === "nodeCompleted");
		const ids = completed.map((e) => (e.type === "nodeCompleted" ? e.nodeId : ""));
		// only the action itself should complete, no next
		expect(ids).toContain("a1");
		expect(ids).not.toContain("x");
	});
});
