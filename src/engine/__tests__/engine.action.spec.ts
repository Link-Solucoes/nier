import { describe, expect, it, vi } from "vitest";
import type { Automation } from "../../core/types";
import { coreRegistry } from "../../registry/registry";
import { createEngine } from "../engine";
import { InlineSchedulerAdapter } from "../scheduler";
import { InMemoryExecutionStore } from "../store/in-memory";
import type { EngineEvent } from "../types";

describe("engine action result and error", () => {
	it("captures action result in state.exec.nodeResults and emits nodeCompleted with result", async () => {
		const automation: Automation = {
			meta: { id: "a", name: "act" },
			rootNodeId: "n1",
			graph: {
				nodes: [
					{
						id: "n1",
						type: "action",
						action: { kind: "echo", params: { v: 1 } },
					},
					{ id: "end", type: "end" },
				],
				edges: [{ id: "e1", from: "n1", to: "end" }],
			},
			triggers: [],
		};
		const reg = { ...coreRegistry };
		reg.actionKinds.echo = {
			kind: "echo",
			execute: async (p) => ({ status: "ok", data: p }),
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

		await engine.startFlowPerNode({ automation, executionId: "ex1" });
		const s = await store.load("ex1");
		expect(s?.exec?.nodeResults.n1).toEqual({
			status: "ok",
			data: { v: 1 },
		});
		const events: EngineEvent[] = onEvent.mock.calls.map((c) => c[0]);
		const nc = events.find((e) => e.type === "nodeCompleted" && e.nodeId === "n1");
		expect(nc && nc.type === "nodeCompleted" ? nc.result : undefined).toEqual({ status: "ok", data: { v: 1 } });
	});

	it("emits nodeErrored and persists __lastError on thrown error", async () => {
		const automation: Automation = {
			meta: { id: "a2", name: "err" },
			rootNodeId: "n1",
			graph: {
				nodes: [{ id: "n1", type: "action", action: { kind: "boom" } }],
			},
			triggers: [],
		};
		const reg = { ...coreRegistry };
		reg.actionKinds.boom = {
			kind: "boom",
			execute: async () => {
				throw new Error("bad");
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
					} catch {}
				},
			}),
		});

		await engine.startFlowPerNode({ automation, executionId: "ex2" });
		const s = await store.load("ex2");
		const lastErr = (s?.data as Record<string, unknown>).__lastError as { message?: string } | undefined;
		expect(lastErr?.message).toBe("bad");
		const events: EngineEvent[] = onEvent.mock.calls.map((c) => c[0]);
		expect(events.some((e) => e.type === "nodeErrored" && e.nodeId === "n1")).toBe(true);
	});
});
