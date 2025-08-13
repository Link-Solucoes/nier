import type { ConstOperand, ContextOperand, FnOperand, Operand, RuntimeContextSpaces, VarOperand } from "../core/types";
import type { Registry } from "../registry/registry";

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null;
}

function getByPath(obj: unknown, path: string): unknown {
	if (!isRecord(obj)) return undefined;
	if (!path) return undefined;
	const parts = path.split(".");
	let cur: unknown = obj;
	for (const p of parts) {
		if (!isRecord(cur)) return undefined;
		cur = cur[p];
	}
	return cur;
}

function getTopLevelKey(obj: unknown, key: string): unknown {
	if (!isRecord(obj)) return undefined;
	return obj[key];
}

export async function resolveOperand(
	operand: Operand,
	runtime: RuntimeContextSpaces,
	registry: Registry,
): Promise<unknown> {
	// Try registry-provided resolver by kind first for extensibility
	const customResolver = registry.operandResolvers[operand.kind];
	if (customResolver) {
		return customResolver.resolve(operand, runtime);
	}

	switch (operand.kind) {
		case "const":
			return (operand as ConstOperand).value;
		case "var": {
			// Lookup in exec, then user, then flow (common precedence)
			const { path } = operand as VarOperand;
			// Support explicit prefixes: exec., user., flow.
			if (path.startsWith("exec.")) {
				return getByPath(runtime.exec, path.slice("exec.".length));
			}
			if (path.startsWith("user.")) {
				return getByPath(runtime.user?.data, path.slice("user.".length));
			}
			if (path.startsWith("flow.")) {
				return getByPath(runtime.flow, path.slice("flow.".length));
			}
			// No prefix: try precedence exec -> user.data -> flow
			return getByPath(runtime.exec, path) ?? getByPath(runtime.user?.data, path) ?? getByPath(runtime.flow, path);
		}
		case "context": {
			const { key } = operand as ContextOperand;
			// Simple top-level key lookup across spaces (exec > user > flow)
			return (
				getTopLevelKey(runtime.exec, key) ??
				getTopLevelKey(runtime.user?.data, key) ??
				getTopLevelKey(runtime.flow, key)
			);
		}
		case "fn": {
			const { fnId } = operand as FnOperand;
			const fnResolver = registry.operandResolvers[fnId];
			if (!fnResolver) throw new Error(`Operand fn resolver not found: ${fnId}`);
			return fnResolver.resolve(operand, runtime);
		}
		default:
			return undefined;
	}
}

export async function resolveOperands(
	operands: Operand[],
	runtime: RuntimeContextSpaces,
	registry: Registry,
): Promise<unknown[]> {
	return Promise.all(operands.map((op) => resolveOperand(op, runtime, registry)));
}
