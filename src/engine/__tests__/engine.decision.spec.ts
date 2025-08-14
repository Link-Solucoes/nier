import { describe, expect, it, vi } from "vitest";
import type { Automation } from "../../core/types";
import { coreRegistry, createComparator, createRegistry, mergeRegistry } from "../../registry/registry";
import { createEngine } from "../engine";
import { InlineSchedulerAdapter } from "../scheduler";
import { InMemoryExecutionStore } from "../store/in-memory";
import type { EngineEvent } from "../types";

function makeEngine(registry = coreRegistry) {
	const store = new InMemoryExecutionStore();
	const onEvent = vi.fn();
	const engine = createEngine({
		runtime: { registry, onEvent, store },
		scheduler: new InlineSchedulerAdapter({
			onFlowJob: async () => {},
			onNodeJob: async ({ executionId, nodeId }) => {
				await engine.handleNodeJob({
					automation,
					executionId,
					nodeId,
					userData: { x: 1 },
				});
			},
		}),
	});
	return { engine, onEvent, store };
}

const baseAutomation: Automation = {
	meta: { id: "auto", name: "decision" },
	rootNodeId: "start",
	graph: {
		nodes: [
			{ id: "start", type: "action", action: { kind: "noop" } },
			{
				id: "dec",
				type: "decision",
				branches: [
					{
						id: "b1",
						to: "end",
						condition: {
							root: {
								type: "condition",
								comparator: "EQ",
								left: { kind: "const", value: 1 },
								right: { kind: "const", value: 1 },
							},
						},
					},
					{
						id: "b2",
						to: "end",
						condition: {
							root: {
								type: "condition",
								comparator: "EQ",
								left: { kind: "const", value: 2 },
								right: { kind: "const", value: 2 },
							},
						},
					},
				],
				defaultTo: "end",
			},
			{ id: "end", type: "end" },
		],
		edges: [{ id: "e1", from: "start", to: "dec" }],
	},
	triggers: [],
};

const automation = baseAutomation;

describe("engine decision", () => {
	const eq = createComparator({
		id: "EQ",
		arity: 2,
		eval: async ([a, b]) => a === b,
	});
	const registry = mergeRegistry(coreRegistry, createRegistry({ comparators: [eq] }));

	it("chooses first match and emits multi-match", async () => {
		const { engine, onEvent } = makeEngine(registry);
		await engine.startFlowPerNode({ automation, executionId: "e1" });
		const events: EngineEvent[] = onEvent.mock.calls.map((c) => c[0] as EngineEvent);
		const mm = events.find((e) => e.type === "decisionMultiMatch");
		expect(mm).toBeDefined();
		const completed = events.filter((e) => e.type === "nodeCompleted");
		expect(completed.some((e) => e.type === "nodeCompleted" && e.nodeId === "dec")).toBe(true);
	});

	it("falls back to default when no match", async () => {
		const neq = createComparator({
			id: "EQ",
			arity: 2,
			eval: async ([a, b]) => a !== b,
		});
		const reg2 = mergeRegistry(coreRegistry, createRegistry({ comparators: [neq] }));
		const { engine, onEvent } = makeEngine(reg2);
		await engine.startFlowPerNode({ automation, executionId: "e2" });
		const events: EngineEvent[] = onEvent.mock.calls.map((c) => c[0] as EngineEvent);
		// ensure we visited 'dec' and then continued to 'end'
		const completed = events.filter((e) => e.type === "nodeCompleted");
		const nodeIds = completed.map((e) => (e.type === "nodeCompleted" ? e.nodeId : ""));
		expect(nodeIds).toContain("dec");
	});
});
