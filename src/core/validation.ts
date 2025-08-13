/**
 * Estruturas de validação e stub da função validateAutomation (Task 1).
 */

import type { Registry } from "../registry/registry";
import { basicRules } from "../validation/rules/basic";
import { extendedConditionRules } from "../validation/rules/conditions";
import { structuralRules } from "../validation/rules/structural";
import type { ValidationContext, ValidationRule } from "../validation/rules/types";
import type { Indices } from "./indices";
import { buildIndices } from "./indices";
import type { Automation } from "./types";

export type ValidationIssueLevel = "error" | "warning" | "info";

export interface ValidationIssue {
	level: ValidationIssueLevel;
	code: string; // ex: NODE_DUPLICATE_ID, EDGE_CYCLE_DETECTED
	message: string;
	context?: Record<string, unknown>;
}

export interface ValidationResult {
	issues: ValidationIssue[];
	summary: {
		errors: number;
		warnings: number;
		infos: number;
	};
	valid: boolean; // true se errors == 0
}

/**
 * Opções para validação (ex: curto-circuito, níveis desejados).
 */
export interface ValidateOptions {
	failFast?: boolean; // se true, pode retornar ao primeiro erro (futuro)
}

/**
 * Parâmetros para validação da automação.
 */
export interface ValidateAutomationParams {
	automation: Automation;
	registry: Registry;
	indices?: Indices;
	options?: ValidateOptions;
	extraRules?: ValidationRule[]; // extensão DX
}

/**
 * Valida a automação contra um conjunto de regras.
 * @param params Parâmetros de validação
 */
export function validateAutomation(params: ValidateAutomationParams): ValidationResult {
	const { automation, registry, indices: prebuilt, options, extraRules = [] } = params;
	const indices = prebuilt || buildIndices(automation.graph);
	const allRules: ValidationRule[] = [
		...basicRules,
		...structuralRules,
		...extendedConditionRules,
		...(registry.validationRules || []),
		...extraRules,
	];
	const issues: ValidationIssue[] = [];
	const ctx: ValidationContext = {
		automation,
		graph: automation.graph,
		indices,
		registry,
	};
	for (const rule of allRules) {
		const produced = rule(ctx);
		if (produced.length) issues.push(...produced);
		if (options?.failFast && produced.some((i) => i.level === "error")) break;
	}
	const summary = issues.reduce(
		(acc, i) => {
			if (i.level === "error") acc.errors++;
			else if (i.level === "warning") acc.warnings++;
			else acc.infos++;
			return acc;
		},
		{ errors: 0, warnings: 0, infos: 0 },
	);
	return { issues, summary, valid: summary.errors === 0 };
}

export function listDefaultValidationRules(): string[] {
	return [...basicRules, ...structuralRules, ...extendedConditionRules].map((r) => r.name);
}
