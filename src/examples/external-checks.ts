import {
	type Automation,
	coreRegistry,
	createComparator,
	createEngine,
	createOperandResolver,
	createRegistry,
	InlineSchedulerAdapter,
	InMemoryExecutionStore,
	mergeRegistry,
	type RuntimeContextSpaces,
} from "..";
import { createTriggerHelper, type TriggerExecConfig } from "../engine/triggers";

// Mock repo to simulate external data access
const userRepo = {
	createdAtIsoById: new Map<string, string>(),
	setCreatedAt(id: string, date: Date) {
		this.createdAtIsoById.set(id, date.toISOString());
	},
	async getCreatedAt(id: string): Promise<string | undefined> {
		return this.createdAtIsoById.get(id);
	},
};

// Operand resolver: days_since_signup
const daysSinceSignup = createOperandResolver({
	kind: "days_since_signup",
	resolve: async (_operand, runtime: unknown) => {
		const r = runtime as RuntimeContextSpaces;
		const userId = r.user?.data?.userId as string | undefined;
		if (!userId) return undefined;
		const createdAtIso = await userRepo.getCreatedAt(userId);
		if (!createdAtIso) return undefined;
		const ms = Date.now() - new Date(createdAtIso).getTime();
		return Math.floor(ms / 86_400_000); // days
	},
});

// Real comparators
const gt = createComparator({
	id: "GT",
	arity: 2,
	eval: async ([a, b]) => Number(a) > Number(b),
});

// Registry with resolver + comparator
const registry = mergeRegistry(
	coreRegistry,
	createRegistry({ operandResolvers: [daysSinceSignup], comparators: [gt] }),
);

// Simple automation: start -> end with a log action
registry.actionKinds.log = {
	kind: "log",
	execute: async (params) => {
		console.log("[action:log]", params);
		return { status: "ok", data: params };
	},
};

const automation: Automation = {
	meta: { id: "auto_external_checks", name: "External Checks Demo" },
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
	triggers: [{ id: "t_user_created", event: "user.created" }],
};

// Engine (per-node)
const store = new InMemoryExecutionStore();
const userDataByExec = new Map<string, Record<string, unknown>>();
const runtime = {
	registry,
	store,
	onEvent: (e: unknown) => console.log("[event]", e),
};
const engine = createEngine({
	runtime,
	scheduler: new InlineSchedulerAdapter({
		onFlowJob: async () => {},
		onNodeJob: async ({ executionId, nodeId }) => {
			const userData = userDataByExec.get(executionId);
			await engine.handleNodeJob({
				automation,
				executionId,
				nodeId,
				userData,
			});
			if (userData) userDataByExec.delete(executionId);
		},
	}),
});

// Trigger helper using external check in filter: days_since_signup > 5
interface UserEvent {
	id: string;
}
const execCfg: TriggerExecConfig<UserEvent> = {
	makeExecutionId: (e) => `exec_${e.id}`,
	selectAutomation: () => automation,
	mapUserData: (e) => ({ userId: e.id }),
	mode: "per-node",
};

const userCreated = createTriggerHelper<UserEvent>({
	id: "t_user_created",
	event: "user.created",
	filter: {
		type: "condition",
		comparator: "GT",
		left: { kind: "fn", fnId: "days_since_signup" },
		right: { kind: "const", value: 5 },
	},
	exec: execCfg,
});

async function onIncomingEvent(evt: UserEvent) {
	const res = await userCreated.handle(evt, runtime);
	console.log("[trigger] handle result:", { evt, res });
	if (!res.started || !res.executionId) return;

	const udata = execCfg.mapUserData ? execCfg.mapUserData(evt) : {};
	userDataByExec.set(res.executionId, udata);

	console.log("[engine] starting flow per node:", res.executionId);
	await engine.startFlowPerNode({ automation, executionId: res.executionId });
}

async function main() {
	console.log("[main] seeding repo and sending events");
	// Seed userRepo with createdAt based on desired age
	const now = Date.now();
	userRepo.setCreatedAt("u_old", new Date(now - 10 * 86_400_000)); // 10 days ago
	userRepo.setCreatedAt("u_new", new Date(now - 3 * 86_400_000)); // 3 days ago

	await onIncomingEvent({ id: "u_old" }); // should start (10 > 5)
	await onIncomingEvent({ id: "u_new" }); // should be ignored (3 <= 5)
}

// ESM-friendly: always run when executed directly with tsx/node
void main();
