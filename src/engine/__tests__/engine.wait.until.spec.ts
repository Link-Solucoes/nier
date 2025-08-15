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

describe("wait until scheduling", () => {
	it("computes delay from ISO timestamp and schedules next", async () => {
		await withFakeTimers(async () => {
			const target = new Date(Date.now() + 200).toISOString();
			const automation: Automation = {
				meta: { id: "wait-until", name: "wait-until" },
				rootNodeId: "w",
				graph: {
					nodes: [
						{
							id: "w",
							type: "wait",
							wait: { kind: "until", untilTimestamp: target },
							to: "end",
						},
						{ id: "end", type: "end" },
					],
				},
				triggers: [],
			};

			const store = new InMemoryExecutionStore();
			const onEvent = vi.fn();
			const engine = createEngine({
				runtime: { registry: coreRegistry, onEvent, store },
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

			const startPromise = engine.startFlowPerNode({
				automation,
				executionId: "wu1",
			});
			// advance slightly less than target, should not complete end yet
			await vi.advanceTimersByTimeAsync(150);
			let events: EngineEvent[] = onEvent.mock.calls.map((c) => c[0]);
			expect(events.some((e) => e.type === "nodeCompleted" && e.nodeId === "end")).toBe(false);
			// advance beyond the target
			await vi.advanceTimersByTimeAsync(100);
			await startPromise;
			events = onEvent.mock.calls.map((c) => c[0]);
			expect(events.some((e) => e.type === "nodeCompleted" && e.nodeId === "end")).toBe(true);
		});
	});
});
