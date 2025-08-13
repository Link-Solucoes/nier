/** Regras estruturais: alcançabilidade, ciclos, specific node semantics. */

import type { AnyNode, DecisionNode, ParallelNode, WaitNode } from "../../core/types";
import type { ValidationIssue } from "../../core/validation";
import type { ValidationRule } from "./types";
import { IssueCodes } from "./types";

// Alcançabilidade a partir do rootNodeId seguindo adjacency (indices.outgoing)
export const ruleReachability: ValidationRule = ({ automation, indices }) => {
	const issues: ValidationIssue[] = [];
	const root = automation.rootNodeId;
	if (!root || !indices.nodeMap[root]) return issues; // outras regras já reportam
	const visited = new Set<string>();
	const stack: string[] = [root];
	while (stack.length) {
		const popped = stack.pop();
		if (popped == null) continue;
		const id = popped;
		if (visited.has(id)) continue;
		visited.add(id);
		for (const to of indices.outgoing[id] || []) stack.push(to);
	}
	for (const id of Object.keys(indices.nodeMap)) {
		if (!visited.has(id)) {
			issues.push({
				level: "error",
				code: IssueCodes.NODE_UNREACHABLE,
				message: `Nó inalcançável a partir do root`,
				context: { nodeId: id },
			});
		}
	}
	return issues;
};

// Ciclos via DFS cor
export const ruleCycles: ValidationRule = ({ indices }) => {
	const issues: ValidationIssue[] = [];
	const color: Record<string, 0 | 1 | 2> = {}; // 0=white,1=gray,2=black
	const path: string[] = [];
	const dfs = (id: string) => {
		color[id] = 1;
		path.push(id);
		for (const to of indices.outgoing[id] || []) {
			if (color[to] === 1) {
				issues.push({
					level: "error",
					code: IssueCodes.CYCLE_DETECTED,
					message: `Ciclo detectado`,
					context: { cycleEdge: { from: id, to }, path: [...path] },
				});
			} else if (color[to] === 0 || color[to] === undefined) {
				dfs(to);
			}
		}
		path.pop();
		color[id] = 2;
	};
	for (const id of Object.keys(indices.outgoing)) {
		if (!color[id]) dfs(id);
	}
	return issues;
};

function isDecision(n: AnyNode): n is DecisionNode {
	return n.type === "decision";
}
function isParallel(n: AnyNode): n is ParallelNode {
	return n.type === "parallel";
}
function isWait(n: AnyNode): n is WaitNode {
	return n.type === "wait";
}

export const ruleDecisionNodes: ValidationRule = ({ graph }) => {
	const issues: ValidationIssue[] = [];
	for (const n of graph.nodes)
		if (isDecision(n)) {
			if (!n.branches.length) {
				issues.push({
					level: "error",
					code: IssueCodes.DECISION_NO_BRANCHES,
					message: `Decision sem branches`,
					context: { nodeId: n.id },
				});
				continue;
			}
			// Pelo menos uma branch com condition (regra 13): se exige condition, validar
			const hasCondition = n.branches.some((b) => !!b.condition);
			if (!hasCondition) {
				issues.push({
					level: "error",
					code: IssueCodes.DECISION_NO_CONDITION,
					message: `Decision sem nenhuma condição`,
					context: { nodeId: n.id },
				});
			}
		}
	return issues;
};

export const ruleParallelNodes: ValidationRule = ({ graph }) => {
	const issues: ValidationIssue[] = [];
	for (const n of graph.nodes)
		if (isParallel(n)) {
			if (n.branches.length < 2) {
				issues.push({
					level: "error",
					code: IssueCodes.PARALLEL_BRANCH_COUNT,
					message: `Parallel exige >=2 branches`,
					context: { nodeId: n.id },
				});
			}
			if (n.join?.strategy === "count") {
				const c = n.join.count ?? 0;
				if (c <= 0 || c > n.branches.length) {
					issues.push({
						level: "error",
						code: IssueCodes.PARALLEL_JOIN_COUNT_INVALID,
						message: `Join count inválido`,
						context: { nodeId: n.id, count: c },
					});
				}
			}
		}
	return issues;
};

export const ruleWaitNodes: ValidationRule = ({ graph }) => {
	const issues: ValidationIssue[] = [];
	for (const n of graph.nodes)
		if (isWait(n)) {
			if (n.wait.kind === "duration" && (!n.wait.durationMs || n.wait.durationMs <= 0)) {
				issues.push({
					level: "error",
					code: IssueCodes.WAIT_INVALID_CONFIG,
					message: `Wait duration inválida`,
					context: { nodeId: n.id },
				});
			}
			if (n.wait.kind === "until" && !n.wait.untilTimestamp) {
				issues.push({
					level: "error",
					code: IssueCodes.WAIT_INVALID_CONFIG,
					message: `Wait until sem timestamp`,
					context: { nodeId: n.id },
				});
			}
		}
	return issues;
};

export const ruleThrottle: ValidationRule = ({ automation }) => {
	const issues: ValidationIssue[] = [];
	for (const t of automation.triggers) {
		if (t.throttle && (t.throttle.intervalMs <= 0 || t.throttle.maxInInterval <= 0)) {
			issues.push({
				level: "error",
				code: IssueCodes.THROTTLE_INVALID,
				message: `Throttle inválido`,
				context: { triggerId: t.id },
			});
		}
	}
	return issues;
};

export const structuralRules: ValidationRule[] = [
	ruleReachability,
	ruleCycles,
	ruleDecisionNodes,
	ruleParallelNodes,
	ruleWaitNodes,
	ruleThrottle,
];
