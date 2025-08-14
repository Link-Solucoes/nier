import { describe, expect, it, vi } from "vitest";
import type { Automation } from "../../core/types";
import { coreRegistry } from "../../registry/registry";
import { createEngine } from "../engine";
import { InlineSchedulerAdapter } from "../scheduler";
import { InMemoryExecutionStore } from "../store/in-memory";
import type { EngineEvent } from "../types";

describe("engine retries/backoff", () => {
	it("retries action on failure then succeeds", async () => {
		const automation: Automation = {
			meta: { id: "r1", name: "retry" },
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
		let attempts = 0;
		const reg = { ...coreRegistry };
		reg.actionKinds.flaky = {
			kind: "flaky",
			retry: { maxAttempts: 2, backoffMs: 1 },
			execute: async () => {
				attempts += 1;
				if (attempts === 1)
					return { status: "error", error: "boom" } as const;
				return { status: "ok" } as const;
			},
		};

		const store = new InMemoryExecutionStore();
		const onEvent = vi.fn();
		const engine = createEngine({
			runtime: { registry: reg, onEvent, store },
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

		await engine.startFlowPerNode({ automation, executionId: "rx" });
		const events: EngineEvent[] = onEvent.mock.calls.map((c) => c[0]);
		// should have scheduled a retry and eventually completed 'end'
		expect(
			events.some(
				(e) => e.type === "nodeRetryScheduled" && e.nodeId === "a1"
			)
		).toBe(true);
		expect(
			events.some((e) => e.type === "nodeCompleted" && e.nodeId === "end")
		).toBe(true);
	});
});
