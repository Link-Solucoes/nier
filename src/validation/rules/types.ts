/** Tipos centrais para regras de validação (DX amigável). */

import type { Indices } from "../../core/indices";
import type { Automation, Graph } from "../../core/types";
import type { ValidationIssue } from "../../core/validation";
import type { Registry } from "../../registry/registry";

export interface ValidationContext {
	automation: Automation;
	graph: Graph;
	indices: Indices;
	registry: Registry;
}

export type ValidationRule = (ctx: ValidationContext) => ValidationIssue[];

/** Codes padronizados */
export const IssueCodes = {
	GRAPH_ROOT_MISSING: "GRAPH_ROOT_MISSING",
	GRAPH_ROOT_NOT_FOUND: "GRAPH_ROOT_NOT_FOUND",
	NODE_DUPLICATE_ID: "NODE_DUPLICATE_ID",
	EDGE_DUPLICATE_ID: "EDGE_DUPLICATE_ID",
	TRIGGER_DUPLICATE_ID: "TRIGGER_DUPLICATE_ID",
	EDGE_NODE_MISSING: "EDGE_NODE_MISSING",
	NODE_UNREACHABLE: "NODE_UNREACHABLE",
	CYCLE_DETECTED: "CYCLE_DETECTED",
	DECISION_NO_BRANCHES: "DECISION_NO_BRANCHES",
	DECISION_NO_CONDITION: "DECISION_NO_CONDITION",
	PARALLEL_BRANCH_COUNT: "PARALLEL_BRANCH_COUNT",
	PARALLEL_JOIN_COUNT_INVALID: "PARALLEL_JOIN_COUNT_INVALID",
	WAIT_INVALID_CONFIG: "WAIT_INVALID_CONFIG",
	THROTTLE_INVALID: "THROTTLE_INVALID",
	COMPARATOR_UNKNOWN: "COMPARATOR_UNKNOWN",
	DECISION_POSSIBLE_MULTI_MATCH: "DECISION_POSSIBLE_MULTI_MATCH",
	EDGE_POSSIBLE_MULTI_MATCH: "EDGE_POSSIBLE_MULTI_MATCH",
} as const;

export type IssueCode = (typeof IssueCodes)[keyof typeof IssueCodes];
