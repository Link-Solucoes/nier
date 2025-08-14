import { describe, expect, it, vi } from "vitest";
import type { Automation } from "../../core/types";
import { coreRegistry, createComparator, createRegistry, mergeRegistry } from "../../registry/registry";
import { createTriggerHelper } from "../triggers";
import type { EngineRuntime } from "../types";

describe("trigger helper", () => {
	const eq = createComparator({
		id: "EQ",
		arity: 2,
		eval: async ([a, b]) => a === b,
	});
	const registry = mergeRegistry(coreRegistry, createRegistry({ comparators: [eq] }));
	const automation: Automation = {
		meta: { id: "a1", name: "t" },
		rootNodeId: "end",
		graph: { nodes: [{ id: "end", type: "end" }] },
		triggers: [],
	};

	it("filters event and returns started + executionId", async () => {
		const helper = createTriggerHelper<{ kind: string; id: string }>({
			id: "t1",
			event: "user.created",
			filter: {
				type: "condition",
				comparator: "EQ",
				left: { kind: "const", value: "user.created" },
				right: { kind: "var", path: "user.kind" },
			},
			exec: {
				makeExecutionId: (e) => `exec_${e.id}`,
				selectAutomation: () => automation,
				mapUserData: (e) => ({ kind: e.kind, id: e.id }),
				mode: "per-node",
			},
		});
		const runtime: EngineRuntime = {
			registry,
			onEvent: vi.fn(),
			store: undefined,
		} as unknown as EngineRuntime;
		const ok = await helper.handle({ kind: "user.created", id: "42" }, runtime);
		expect(ok.started).toBe(true);
		expect(ok.executionId).toBe("exec_42");

		const ko = await helper.handle({ kind: "user.updated", id: "7" }, runtime);
		expect(ko.started).toBe(false);
	});
});
