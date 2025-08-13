import { describe, expect, it, vi } from "vitest";
import type { Automation } from "../../core/types";
import {
	coreRegistry,
	createOperandResolver,
	createRegistry,
	mergeRegistry,
} from "../../registry/registry";
import { createEngine } from "../engine";
import { InlineSchedulerAdapter } from "../scheduler";
import { InMemoryExecutionStore } from "../store/in-memory";
import type { EngineEvent } from "../types";

/** Ensure errors from operand resolver propagate to nodeErrored and state is persisted. */
describe("engine error propagation", () => {
	it("operand resolver throws -> nodeErrored", async () => {
		const bad = createOperandResolver({
			kind: "bad",
			resolve: async () => {
				throw new Error("oops");
			},
		});
		const reg = mergeRegistry(
			coreRegistry,
			createRegistry({ operandResolvers: [bad] })
		);
		const automation: Automation = {
			meta: { id: "e", name: "err" },
			rootNodeId: "d",
			graph: {
				nodes: [
					{
						id: "d",
						type: "decision",
						branches: [
							{
								id: "b",
								to: "end",
								condition: {
									root: {
										type: "condition",
										comparator: "EXISTS",
										left: { kind: "bad" } as unknown as {
											kind: "fn";
											fnId: string;
										},
									},
								},
							},
						],
					},
					{ id: "end", type: "end" },
				],
			},
			triggers: [],
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
		await engine.startFlowPerNode({ automation, executionId: "err1" });
		const events: EngineEvent[] = onEvent.mock.calls.map((c) => c[0]);
		expect(
			events.some((e) => e.type === "nodeErrored" && e.nodeId === "d")
		).toBe(true);
	});
});
