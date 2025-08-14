import type { ConditionNode, Operand, RuntimeContextSpaces } from "../core/types";
import type { Registry } from "../registry/registry";
import { resolveOperands } from "./operands";

/**
 * Avalia uma árvore de ConditionNode usando os comparators registrados.
 * Retorna true se a condição for satisfeita; undefined root => true.
 */
export async function evaluateConditionTree(
	root: ConditionNode | undefined,
	runtime: RuntimeContextSpaces,
	registry: Registry,
): Promise<boolean> {
	if (!root) return true;

	const evaluate = async (node: ConditionNode): Promise<boolean> => {
		if (node.type === "group") {
			const children = await Promise.all(node.children.map((c) => evaluate(c)));
			return node.op === "AND" ? children.every(Boolean) : children.some(Boolean);
		}
		const comp = registry.comparators[node.comparator];
		if (!comp) return false; // fail-safe; validação deve cobrir
		const operands: Operand[] = node.right === undefined ? [node.left] : [node.left, node.right];
		const resolved = await resolveOperands(operands, runtime, registry);
		return comp.eval(resolved as unknown as Operand[], runtime);
	};

	return evaluate(root);
}
