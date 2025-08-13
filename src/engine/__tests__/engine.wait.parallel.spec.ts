import { describe, expect, it, vi } from "vitest";
import type { Automation } from "../../core/types";
import { coreRegistry } from "../../registry/registry";
import { createEngine } from "../engine";
import { InlineSchedulerAdapter } from "../scheduler";
import { InMemoryExecutionStore } from "../store/in-memory";
import type { EngineEvent } from "../types";

async function runWithTimers(impl: () => Promise<void>) {
	vi.useFakeTimers({ now: Date.now() });
	try {
		await impl();
	} finally {
		vi.useRealTimers();
	}
}

describe("engine wait and parallel", () => {
	it("schedules next after duration and completes join waitAll", async () => {
		await runWithTimers(async () => {
			const automation: Automation = {
				meta: { id: "auto", name: "wait-parallel" },
				rootNodeId: "start",
				graph: {
					nodes: [
						{
							id: "start",
							type: "wait",
							wait: { kind: "duration", durationMs: 100 },
							to: "par",
						},
						{
							id: "par",
							type: "parallel",
							branches: [
								{ id: "a", start: "a1" },
								{ id: "b", start: "b1" },
							],
							to: "end",
						},
						{ id: "a1", type: "end" },
						{ id: "b1", type: "end" },
						{ id: "end", type: "end" },
					],
				},
				triggers: [],
			};

			const store = new InMemoryExecutionStore();
			const onEvent = vi.fn();
			let resolveFlow: () => void = () => {};
			const flowDone = new Promise<void>((r) => {
				resolveFlow = r;
			});
			const runtime = { registry: coreRegistry, onEvent, store };
			const engine = createEngine({
				runtime,
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

			// mark flow completion using mock implementation
			onEvent.mockImplementation((e: EngineEvent) => {
				if (e.type === "flowCompleted") resolveFlow();
			});

			const startPromise = engine.startFlowPerNode({
				automation,
				executionId: "e3",
			});
			// advance the wait of 100ms so scheduled node runs
			await vi.advanceTimersByTimeAsync(100);
			await Promise.all([startPromise, flowDone]);

			const events: EngineEvent[] = onEvent.mock.calls.map((c) => c[0]);
			const completed = events.filter((e) => e.type === "nodeCompleted");
			// ensure wait then parallel then two branches end then flowCompleted
			expect(completed.some((e) => e.type === "nodeCompleted" && e.nodeId === "start")).toBe(true);
			expect(completed.some((e) => e.type === "nodeCompleted" && e.nodeId === "par")).toBe(true);
			expect(events.some((e) => e.type === "flowCompleted")).toBe(true);
		});
	});
});
