/**
 * Registry extensível (Task 1 - apenas tipos e stubs).
 */
import type { ActionExecutor, ComparatorDefinition, Operand } from "../core/types";
import type { ValidationRule } from "../validation/rules/types";

// =====================
// Node Kind Registry
// =====================
export interface NodeKindDefinition {
	kind: string; // ex: 'action', 'decision' (core) ou custom
	category?: string;
	description?: string;
	schema?: unknown; // TODO: shape de validação (ex: objeto para validadores externos)
	// validateConfig?(config: TConfig): void | never; // futura função específica
	// hooks futuros
}

// =====================
// Action Kind
// =====================
export interface ActionKindDefinition {
	kind: string;
	displayName?: string;
	category?: string;
	schema?: unknown; // validação de params
	execute?: ActionExecutor; // opcional: execução da ação
}

// =====================
// Operand Resolver
// =====================
export interface OperandResolverDefinition {
	kind: string; // ex: 'var', 'context'
	resolve: (operand: Operand, runtime: unknown) => unknown | Promise<unknown>; // FUTURO
}

// =====================
// Registry shape
// =====================
export interface Registry {
	nodeKinds: Record<string, NodeKindDefinition>;
	actionKinds: Record<string, ActionKindDefinition>;
	comparators: Record<string, ComparatorDefinition>;
	operandResolvers: Record<string, OperandResolverDefinition>;
	validationRules: ValidationRule[]; // regras adicionais fornecidas por extensões
}

export interface CreateRegistryInput {
	nodeKinds?: NodeKindDefinition[];
	actionKinds?: ActionKindDefinition[];
	comparators?: ComparatorDefinition[];
	operandResolvers?: OperandResolverDefinition[];
}

export function createRegistry(input: CreateRegistryInput = {}): Registry {
	// TODO: validações simples (duplicidade) Task 3
	const reg: Registry = {
		nodeKinds: {},
		actionKinds: {},
		comparators: {},
		operandResolvers: {},
		validationRules: [],
	};
	for (const nk of input.nodeKinds || []) reg.nodeKinds[nk.kind] = nk;
	for (const ak of input.actionKinds || []) reg.actionKinds[ak.kind] = ak;
	for (const c of input.comparators || []) reg.comparators[c.id] = c;
	for (const or of input.operandResolvers || []) reg.operandResolvers[or.kind] = or;
	return reg;
}

export interface MergeRegistryOptions {
	override?: boolean; // se false, conflito gera erro (Task 3)
}

export function mergeRegistry(base: Registry, extra: Registry, options: MergeRegistryOptions = {}): Registry {
	const { override = true } = options;
	const conflict = (category: string, key: string) => `Conflito em ${category}:'${key}'`;
	if (!override) {
		for (const k of Object.keys(extra.nodeKinds)) if (base.nodeKinds[k]) throw new Error(conflict("nodeKind", k));
		for (const k of Object.keys(extra.actionKinds)) if (base.actionKinds[k]) throw new Error(conflict("actionKind", k));
		for (const k of Object.keys(extra.comparators)) if (base.comparators[k]) throw new Error(conflict("comparator", k));
		for (const k of Object.keys(extra.operandResolvers))
			if (base.operandResolvers[k]) throw new Error(conflict("operandResolver", k));
	}
	return {
		nodeKinds: { ...base.nodeKinds, ...extra.nodeKinds },
		actionKinds: { ...base.actionKinds, ...extra.actionKinds },
		comparators: { ...base.comparators, ...extra.comparators },
		operandResolvers: {
			...base.operandResolvers,
			...extra.operandResolvers,
		},
		validationRules: [...base.validationRules, ...extra.validationRules],
	};
}

// Registry default mínimo (core kinds)
export const coreRegistry = createRegistry({
	nodeKinds: [
		{ kind: "action", category: "core" },
		{ kind: "decision", category: "core" },
		{ kind: "parallel", category: "core" },
		{ kind: "wait", category: "core" },
		{ kind: "end", category: "core" },
	],
	// comparators base mínimos (implementações funcionais)
	comparators: [
		{ id: "EQ", arity: 2, eval: async ([a, b]) => a === b },
		{ id: "NEQ", arity: 2, eval: async ([a, b]) => a !== b },
		{ id: "GT", arity: 2, eval: async ([a, b]) => Number(a) > Number(b) },
		{ id: "LT", arity: 2, eval: async ([a, b]) => Number(a) < Number(b) },
		{
			id: "EXISTS",
			arity: 1,
			eval: async ([a]) => a !== undefined && a !== null,
		},
	],
});

// =====================
// Helpers (factories) DX - validações leves
// =====================

export function createComparator(def: ComparatorDefinition): ComparatorDefinition {
	if (def.arity < 1 || def.arity > 2) throw new Error(`Comparator arity inválida: ${def.id}`);
	return def;
}

export function createNodeKind(def: NodeKindDefinition): NodeKindDefinition {
	if (!def.kind) throw new Error("NodeKind.kind obrigatório");
	return def;
}

export function createActionKind(def: ActionKindDefinition): ActionKindDefinition {
	if (!def.kind) throw new Error("ActionKind.kind obrigatório");
	return def;
}

export function createOperandResolver(def: OperandResolverDefinition): OperandResolverDefinition {
	if (!def.kind) throw new Error("OperandResolver.kind obrigatório");
	if (typeof def.resolve !== "function") throw new Error("OperandResolver.resolve deve ser função");
	return def;
}

export function createValidationRule(rule: ValidationRule): ValidationRule {
	if (typeof rule !== "function") throw new Error("ValidationRule deve ser função");
	return rule;
}

export function withValidationRules(registry: Registry, rules: ValidationRule[]): Registry {
	return {
		...registry,
		validationRules: [...registry.validationRules, ...rules.map(createValidationRule)],
	};
}
