import {
	type Automation,
	coreRegistry,
	createComparator,
	createEngine,
	createRegistry,
	InlineSchedulerAdapter,
	InMemoryExecutionStore,
	mergeRegistry,
} from "..";
import { createTriggerHelper, type TriggerExecConfig } from "../engine/triggers";

// Extend comparators with a concrete EQ implementation
const eq = createComparator({
	id: "EQ",
	arity: 2,
	eval: async ([a, b]) => a === b,
});
const registry = mergeRegistry(coreRegistry, createRegistry({ comparators: [eq] }));

// Simple action kind to observe execution flow
registry.actionKinds.log = {
	kind: "log",
	execute: async (params) => {
		// eslint-disable-next-line no-console
		console.log("[action:log]", params);
		return { status: "ok", data: params };
	},
};

// Minimal automation: start -> end
const automation: Automation = {
	meta: { id: "auto_triggers_1", name: "Triggers Demo" },
	rootNodeId: "start",
	graph: {
		nodes: [
			{
				id: "start",
				type: "action",
				action: { kind: "log", params: { msg: "flow started" } },
			},
			{ id: "end", type: "end" },
		],
		edges: [{ id: "e1", from: "start", to: "end" }],
	},
	triggers: [
		// purely informational for modeling; execution wiring stays in app code
		{ id: "t_user_created", event: "user.created" },
	],
};

// Engine setup (per-node scheduling)
const store = new InMemoryExecutionStore();
const userDataByExec = new Map<string, Record<string, unknown>>();
const runtime = {
	registry,
	store,
	onEvent: (e: unknown) => {
		// eslint-disable-next-line no-console
		console.log("[event]", e);
	},
};
const engine = createEngine({
	runtime,
	scheduler: new InlineSchedulerAdapter({
		onFlowJob: async () => {
			/* unused in this demo */
		},
		onNodeJob: async ({ executionId, nodeId }) => {
			const userData = userDataByExec.get(executionId);
			await engine.handleNodeJob({
				automation,
				executionId,
				nodeId,
				userData,
			});
			// clear after first consumption (root node) for this simple example
			if (userData) userDataByExec.delete(executionId);
		},
	}),
});

// Create a typed trigger helper for the event payload
interface UserEvent {
	kind: string; // e.g., 'user.created' | 'user.updated'
	id: string;
}

const execCfg: TriggerExecConfig<UserEvent> = {
	makeExecutionId: (evt) => `exec_${evt.id}`,
	selectAutomation: () => automation,
	// Importante: com prefixo 'user.', o caminho é relativo à raiz de user.data.
	// Logo, 'user.kind' busca user.data.kind. Mantemos 'kind' no topo.
	mapUserData: (evt) => ({ kind: evt.kind, user: { id: evt.id } }),
	mode: "per-node",
};

const userCreated = createTriggerHelper<UserEvent>({
	id: "t_user_created",
	event: "user.created",
	// Start only when event.kind === 'user.created'
	filter: {
		type: "condition",
		comparator: "EQ",
		left: { kind: "var", path: "user.kind" },
		right: { kind: "const", value: "user.created" },
	},
	exec: execCfg,
});

async function onIncomingEvent(evt: UserEvent) {
	// Ask helper if we should start a flow for this event
	const res = await userCreated.handle(evt, runtime);
	// eslint-disable-next-line no-console
	console.log("[trigger] handle result:", { evt, res });
	if (!res.started || !res.executionId) return;

	// Stash userData to be used by the first node job
	const udata = execCfg.mapUserData ? execCfg.mapUserData(evt) : {};
	userDataByExec.set(res.executionId, udata);

	// Actually start the flow (per-node scheduling)
	// eslint-disable-next-line no-console
	console.log("[engine] starting flow per node:", res.executionId);
	await engine.startFlowPerNode({ automation, executionId: res.executionId });
}

async function main() {
	console.log("[main] sending events");
	await onIncomingEvent({ kind: "user.created", id: "42" }); // should start
	await onIncomingEvent({ kind: "user.updated", id: "99" }); // should be ignored
}

// Only run when executed directly in a Node context
if (typeof require !== "undefined" && require.main === module) {
	void main();
}
