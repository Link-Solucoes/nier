import { describe, expect, it, vi } from "vitest";
import type { Automation } from "../../core/types";
import { coreRegistry, createComparator, createRegistry, mergeRegistry } from "../../registry/registry";
import { createEngine } from "../engine";
import { InlineSchedulerAdapter } from "../scheduler";
import { InMemoryExecutionStore } from "../store/in-memory";
import type { EngineEvent } from "../types";

const TRUE = createComparator({ id: "TRUE", arity: 1, eval: async () => true });
const FALSE = createComparator({
	id: "FALSE",
	arity: 1,
	eval: async () => false,
});

function setup(reg = coreRegistry) {
	const store = new InMemoryExecutionStore();
	const onEvent = vi.fn();
	const engine = createEngine({
		runtime: { registry: reg, onEvent, store },
		scheduler: new InlineSchedulerAdapter({
			onFlowJob: async () => {},
			onNodeJob: async ({ executionId, nodeId }) => {
				await engine.handleNodeJob({ automation, executionId, nodeId });
			},
		}),
	});
	return { engine, onEvent };
}

const automation: Automation = {
	meta: { id: "dec-groups", name: "dec-groups" },
	rootNodeId: "start",
	graph: {
		nodes: [
			{
				id: "start",
				type: "decision",
				branches: [
					{
						id: "b1",
						to: "end",
						condition: {
							root: {
								type: "group",
								op: "AND",
								children: [
									{
										type: "condition",
										comparator: "TRUE",
										left: { kind: "const", value: 1 },
									},
									{
										type: "condition",
										comparator: "TRUE",
										left: { kind: "const", value: 2 },
									},
								],
							},
						},
					},
					{
						id: "b2",
						to: "end",
						condition: {
							root: {
								type: "group",
								op: "OR",
								children: [
									{
										type: "condition",
										comparator: "FALSE",
										left: { kind: "const", value: 1 },
									},
									{
										type: "condition",
										comparator: "TRUE",
										left: { kind: "const", value: 2 },
									},
								],
							},
						},
					},
				],
			},
			{ id: "end", type: "end" },
		],
	},
	triggers: [],
};

describe("decision group conditions", () => {
	it("evaluates AND and OR correctly; missing comparator yields false", async () => {
		const reg = mergeRegistry(coreRegistry, createRegistry({ comparators: [TRUE, FALSE] }));
		const { engine, onEvent } = setup(reg);
		await engine.startFlowPerNode({ automation, executionId: "dg1" });
		const events: EngineEvent[] = onEvent.mock.calls.map((c) => c[0]);
		// since both branches are true, multi-match should occur
		expect(events.some((e) => e.type === "decisionMultiMatch")).toBe(true);
	});

	it("no defaultTo and all false -> no next", async () => {
		const reg = mergeRegistry(coreRegistry, createRegistry({ comparators: [FALSE] }));
		const { engine, onEvent } = setup(reg);
		await engine.startFlowPerNode({ automation, executionId: "dg2" });
		const events: EngineEvent[] = onEvent.mock.calls.map((c) => c[0]);
		// decision completed but not end
		expect(events.some((e) => e.type === "nodeCompleted" && e.nodeId === "start")).toBe(true);
		expect(events.some((e) => e.type === "nodeCompleted" && e.nodeId === "end")).toBe(false);
	});
});
