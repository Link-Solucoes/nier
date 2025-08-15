import { describe, expect, it } from "vitest";
import type { Operand, RuntimeContextSpaces } from "../../core/types";
import { coreRegistry } from "../../registry/registry";
import { resolveOperands } from "../operands";

describe("operand var prefixes and precedence", () => {
	it("prefers explicit prefixes and falls back to exec -> user -> flow", async () => {
		const runtime: RuntimeContextSpaces = {
			flow: {
				automationId: "a",
				rootNodeId: "r",
				startedAt: new Date().toISOString(),
			},
			exec: {
				currentNodeId: "n1",
				lastNodeId: undefined,
				nodeResults: { user: { score: 1 } },
			},
			user: { data: { score: 7 } },
		};

		const ops: Operand[] = [
			{ kind: "var", path: "user.score" }, // explicit prefix
			{ kind: "var", path: "score" }, // no prefix -> exec then user then flow
			{ kind: "var", path: "exec.nodeResults.user.score" }, // explicit exec
			{ kind: "var", path: "flow.automationId" }, // explicit flow
		];

		const values = await resolveOperands(ops, runtime, coreRegistry);
		expect(values[0]).toBe(7);
		expect(values[1]).toBe(7); // no prefix -> exec (missing) then user.score (7)
		expect(values[2]).toBe(1);
		expect(values[3]).toBe("a");
	});
});
