import {
	coreRegistry,
	createComparator,
	createEngine,
	createRegistry,
	InlineSchedulerAdapter,
	InMemoryExecutionStore,
	mergeRegistry,
} from "..";
import type { Automation } from "../core/types";

// Extend default comparators with simple concrete implementations
const eq = createComparator({
	id: "EQ",
	arity: 2,
	eval: async ([a, b]) => a === b,
});
const exists = createComparator({
	id: "EXISTS",
	arity: 1,
	eval: async ([a]) => a !== undefined && a !== null,
});
const lt = createComparator({
	id: "LT",
	arity: 2,
	eval: async ([a, b]) => Number(a) < Number(b),
});

const registry = mergeRegistry(
	coreRegistry,
	createRegistry({ comparators: [eq, exists, lt] })
);

// Simple action kinds
registry.actionKinds["log"] = {
	kind: "log",
	execute: async (params) => {
		// eslint-disable-next-line no-console
		console.log("[action:log]", params);
		return { status: "ok", data: params };
	},
};

// Automation: action -> decision -> wait -> end; and parallel branch
const automation: Automation = {
	meta: { id: "auto_ex_1", name: "Example Flow" },
	rootNodeId: "start",
	graph: {
		nodes: [
			{
				id: "start",
				type: "action",
				action: { kind: "log", params: { msg: "start" } },
			},
			{
				id: "check",
				type: "decision",
				branches: [
					{
						id: "low",
						to: "waitShort",
						condition: {
							root: {
								type: "condition",
								comparator: "LT",
								left: { kind: "var", path: "user.score" },
								right: { kind: "const", value: 10 },
							},
						},
					},
				],
				defaultTo: "parallel",
			},
			{
				id: "waitShort",
				type: "wait",
				wait: { kind: "duration", durationMs: 50 },
				to: "end",
			},
			{
				id: "parallel",
				type: "parallel",
				branches: [
					{ id: "b1", start: "p1" },
					{ id: "b2", start: "p2" },
				],
				join: { strategy: "waitAll" },
				to: "end",
			},
			{
				id: "p1",
				type: "action",
				action: { kind: "log", params: { branch: 1 } },
			},
			{
				id: "p2",
				type: "action",
				action: { kind: "log", params: { branch: 2 } },
			},
			{ id: "end", type: "end" },
		],
		edges: [{ id: "e1", from: "start", to: "check" }],
	},
	triggers: [],
};

async function main() {
	const store = new InMemoryExecutionStore();
	const engine = createEngine({
		runtime: {
			registry,
			onEvent: (e) => {
				// eslint-disable-next-line no-console
				console.log("[event]", e);
			},
			store,
		},
		scheduler: new InlineSchedulerAdapter({
			onFlowJob: async () => {
				/* unused in per-node example */
			},
			onNodeJob: async ({ executionId, nodeId }) => {
				await engine.handleNodeJob({
					automation,
					executionId,
					nodeId,
					userData: { score: 5 },
				});
			},
		}),
	});

	await engine.startFlowPerNode({ automation, executionId: "exec_demo" });
}

// Only run when executed directly in a Node context
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
if (typeof require !== "undefined" && require.main === module) {
	// eslint-disable-next-line @typescript-eslint/no-floating-promises
	main();
}
