/** Regras básicas: root, IDs, endpoints de edges. */

import type { ValidationIssue } from "../../core/validation";
import type { ValidationRule } from "./types";
import { IssueCodes } from "./types";

export const ruleRootNode: ValidationRule = ({ automation, indices }) => {
	const issues: ValidationIssue[] = [];
	if (!automation.rootNodeId) {
		issues.push({
			level: "error",
			code: IssueCodes.GRAPH_ROOT_MISSING,
			message: "rootNodeId ausente",
		});
	} else if (!indices.nodeMap[automation.rootNodeId]) {
		issues.push({
			level: "error",
			code: IssueCodes.GRAPH_ROOT_NOT_FOUND,
			message: "rootNodeId não encontrado",
			context: { rootNodeId: automation.rootNodeId },
		});
	}
	return issues;
};

export const ruleUniqueIds: ValidationRule = ({ graph, automation }) => {
	const issues: ValidationIssue[] = [];
	const nodeIds = new Set<string>();
	for (const n of graph.nodes) {
		if (nodeIds.has(n.id)) {
			issues.push({
				level: "error",
				code: IssueCodes.NODE_DUPLICATE_ID,
				message: `Node duplicado: ${n.id}`,
				context: { nodeId: n.id },
			});
		} else nodeIds.add(n.id);
	}
	const edgeIds = new Set<string>();
	for (const e of graph.edges || []) {
		if (edgeIds.has(e.id)) {
			issues.push({
				level: "error",
				code: IssueCodes.EDGE_DUPLICATE_ID,
				message: `Edge duplicada: ${e.id}`,
				context: { edgeId: e.id },
			});
		} else edgeIds.add(e.id);
	}
	const triggerIds = new Set<string>();
	for (const t of automation.triggers) {
		if (triggerIds.has(t.id)) {
			issues.push({
				level: "error",
				code: IssueCodes.TRIGGER_DUPLICATE_ID,
				message: `Trigger duplicada: ${t.id}`,
				context: { triggerId: t.id },
			});
		} else triggerIds.add(t.id);
	}
	return issues;
};

export const ruleEdgeEndpoints: ValidationRule = ({ graph, indices }) => {
	const issues: ValidationIssue[] = [];
	for (const e of graph.edges || []) {
		if (!indices.nodeMap[e.from] || !indices.nodeMap[e.to]) {
			issues.push({
				level: "error",
				code: IssueCodes.EDGE_NODE_MISSING,
				message: `Edge liga nó inexistente`,
				context: { edgeId: e.id, from: e.from, to: e.to },
			});
		}
	}
	return issues;
};

export const basicRules: ValidationRule[] = [ruleRootNode, ruleUniqueIds, ruleEdgeEndpoints];
