import { describe, expect, it } from "vitest";
import type { Operand, RuntimeContextSpaces } from "../../core/types";
import { coreRegistry, createOperandResolver, createRegistry, mergeRegistry } from "../../registry/registry";
import { resolveOperands } from "../operands";

describe("operand resolution", () => {
	it("resolves const/var/context and fn via registry", async () => {
		const fnRes = createOperandResolver({
			kind: "toUpper",
			resolve: async (_op, _rt) => "ABC",
		});
		const registry = mergeRegistry(coreRegistry, createRegistry({ operandResolvers: [fnRes] }));
		const runtime: RuntimeContextSpaces = {
			flow: {
				automationId: "a",
				rootNodeId: "r",
				startedAt: new Date().toISOString(),
			},
			exec: {
				currentNodeId: "n1",
				lastNodeId: undefined,
				nodeResults: { x: 42 },
			},
			user: { data: { score: 7, top: { nested: 9 } } },
		};

		const ops: Operand[] = [
			{ kind: "const", value: 5 },
			{ kind: "var", path: "user.score" },
			{ kind: "context", key: "currentNodeId" },
			{ kind: "fn", fnId: "toUpper" },
		];
		const values = await resolveOperands(ops, runtime, registry);
		expect(values[0]).toBe(5);
		expect(values[1]).toBe(7);
		expect(values[2]).toBe("n1");
		expect(values[3]).toBe("ABC");
	});
});
