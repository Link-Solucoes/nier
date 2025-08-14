import {
	type Automation,
	coreRegistry,
	createEngine,
	createRegistry,
	type EngineEvent,
	InlineSchedulerAdapter,
	InMemoryExecutionStore,
	mergeRegistry,
} from "..";

// Example: Action with retry/backoff and enableHistory

async function main() {
	const automation: Automation = {
		meta: { id: "ex_retry", name: "Retry Demo" },
		rootNodeId: "a1",
		graph: {
			nodes: [
				{ id: "a1", type: "action", action: { kind: "flaky" } },
				{ id: "end", type: "end" },
			],
			edges: [{ id: "e1", from: "a1", to: "end" }],
		},
		triggers: [],
	};

	// Registry: add a flaky action that fails once, then succeeds.
	const registry = mergeRegistry(
		coreRegistry,
		createRegistry({
			actionKinds: [
				{
					kind: "flaky",
					retry: { maxAttempts: 2, backoffMs: 250 },
					execute: (() => {
						let attempts = 0;
						return async () => {
							attempts += 1;
							if (attempts === 1)
								return {
									status: "error",
									error: "boom",
								} as const;
							return {
								status: "ok",
								data: { attempts },
							} as const;
						};
					})(),
				},
			],
		})
	);

	const store = new InMemoryExecutionStore();
	const onEvent = (e: EngineEvent) => {
		// eslint-disable-next-line no-console
		console.log("[event]", e);
	};
	const engine = createEngine({
		runtime: { registry, store, onEvent, options: { enableHistory: true } },
		scheduler: new InlineSchedulerAdapter({
			onFlowJob: async () => {},
			onNodeJob: async ({ executionId, nodeId }) => {
				await engine.handleNodeJob({ automation, executionId, nodeId });
			},
		}),
	});

	await engine.startFlowPerNode({ automation, executionId: "rx_demo" });

	const state = await store.load("rx_demo");
	// eslint-disable-next-line no-console
	console.log("history:", state?.history);
	// eslint-disable-next-line no-console
	console.log("attempts:", state?.exec?.attempts);
}

// Only run when executed directly
if (typeof require !== "undefined" && require.main === module) {
	void main();
}
