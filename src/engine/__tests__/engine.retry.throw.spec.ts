import { describe, expect, it, vi } from "vitest";
import type { Automation } from "../../core/types";
import { coreRegistry } from "../../registry/registry";
import { createEngine } from "../engine";
import { InlineSchedulerAdapter } from "../scheduler";
import { InMemoryExecutionStore } from "../store/in-memory";
import type { EngineEvent } from "../types";

async function withFakeTimers<T>(fn: () => Promise<T>) {
	vi.useFakeTimers({ now: Date.now() });
	try {
		return await fn();
	} finally {
		vi.useRealTimers();
	}
}

describe("engine retries on thrown error", () => {
	it("schedules retry when action throws and respects backoff", async () => {
		await withFakeTimers(async () => {
			const automation: Automation = {
				meta: { id: "r-throw", name: "r-throw" },
				rootNodeId: "a1",
				graph: {
					nodes: [
						{
							id: "a1",
							type: "action",
							action: { kind: "flakyThrow" },
						},
						{ id: "end", type: "end" },
					],
					edges: [{ id: "e1", from: "a1", to: "end" }],
				},
				triggers: [],
			};

			let calls = 0;
			const reg = { ...coreRegistry } as typeof coreRegistry & {
				actionKinds: Record<string, (typeof coreRegistry.actionKinds)[keyof typeof coreRegistry.actionKinds]>;
			};
			reg.actionKinds.flakyThrow = {
				kind: "flakyThrow",
				retry: { maxAttempts: 2, backoffMs: 50 },
				execute: async () => {
					calls += 1;
					if (calls === 1) throw new Error("boom");
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
						try {
							await engine.handleNodeJob({
								automation,
								executionId,
								nodeId,
							});
						} catch {
							// swallow thrown error to let retry proceed
						}
					},
				}),
			});

			const start = engine.startFlowPerNode({
				automation,
				executionId: "rx-throw",
			});
			// first attempt throws -> retry scheduled with 50ms backoff
			// advance timers to trigger retry execution
			await vi.advanceTimersByTimeAsync(50);
			await start;

			const events: EngineEvent[] = onEvent.mock.calls.map((c) => c[0]);
			expect(events.some((e) => e.type === "nodeErrored" && e.nodeId === "a1")).toBe(true);
			expect(events.some((e) => e.type === "nodeRetryScheduled" && e.nodeId === "a1" && e.delayMs === 50)).toBe(true);
			// eventually should complete end after second attempt succeeds
			expect(events.some((e) => e.type === "nodeCompleted" && e.nodeId === "end")).toBe(true);
		});
	});
});
