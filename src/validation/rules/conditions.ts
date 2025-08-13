/** Regras relacionadas a conditions e comparators. */

import type { ConditionNode } from "../../core/types";
import type { ValidationIssue } from "../../core/validation";
import type { ValidationRule } from "./types";
import { IssueCodes } from "./types";

function visit(node: ConditionNode, fn: (leaf: ConditionNode) => void) {
	if (node.type === "condition") fn(node);
	else node.children.forEach((c) => visit(c, fn));
}

export const ruleComparatorsKnown: ValidationRule = ({ automation, registry }) => {
	const issues: ValidationIssue[] = [];
	const check = (root: ConditionNode | undefined) => {
		if (!root) return;
		visit(root, (leaf) => {
			if (leaf.type === "condition" && !registry.comparators[leaf.comparator]) {
				issues.push({
					level: "error",
					code: IssueCodes.COMPARATOR_UNKNOWN,
					message: `Comparator desconhecido: ${leaf.comparator}`,
					context: { comparator: leaf.comparator },
				});
			}
		});
	};
	// edges conditions & decision branches handled via graph traversal: percorremos nodes decision
	// Decision branches
	// (Percorrer grafo: simplificação - conditions em DecisionNode.branches e triggers.filter e edges.condition)
	// Será chamado no fluxo principal validateAutomation (que não implementamos aqui) mas por simplicidade percorremos tudo.
	// Percorre triggers
	for (const t of automation.triggers) check(t.filter);
	// Percorre nodes decision + edges explicit
	// Este rule não precisa de indices; será suficiente no automation.graph
	const { graph } = automation;
	for (const n of graph.nodes) {
		if (n.type === "decision") {
			for (const b of n.branches) check(b.condition?.root);
		}
	}
	for (const e of graph.edges || []) check(e.condition?.root);
	return issues;
};

export const conditionRules: ValidationRule[] = [ruleComparatorsKnown];

// Heurística: warning para possíveis múltiplas condições verdadeiras em Decision sem default.
export const ruleDecisionPossibleMultiMatch: ValidationRule = ({ automation }) => {
	const issues: ValidationIssue[] = [];
	const { graph } = automation;
	for (const n of graph.nodes) {
		if (n.type !== "decision") continue;
		const condBranches = n.branches.filter((b) => !!b.condition);
		if (condBranches.length > 1 && !n.defaultTo) {
			issues.push({
				level: "warning",
				code: IssueCodes.DECISION_POSSIBLE_MULTI_MATCH,
				message: `Decision pode ter múltiplas condições verdadeiras; será escolhida a primeira em ordem.`,
				context: { nodeId: n.id },
			});
		}
	}
	return issues;
};

export const extendedConditionRules: ValidationRule[] = [ruleComparatorsKnown, ruleDecisionPossibleMultiMatch];
