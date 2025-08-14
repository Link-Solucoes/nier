import { listDefaultValidationRules } from "../core/validation";
import type { Registry } from "../registry/registry";
import type {
	CapabilitiesManifest,
	CompiledSchemaOutput,
	CompileOptions,
} from "./types";

/** Build a manifest of capabilities from the current registry. */
export function buildCapabilitiesManifest(
	registry: Registry
): CapabilitiesManifest {
	const nodeKinds = Object.values(registry.nodeKinds).map(
		({ kind, category, description }) => ({
			kind,
			category,
			description,
		})
	);
	const actionKinds = Object.values(registry.actionKinds).map(
		({ kind, displayName, category, schema }) => ({
			kind,
			displayName,
			category,
			schema,
		})
	);
	const comparators = Object.values(registry.comparators).map(
		({ id, arity }) => ({ id, arity })
	);
	const operandResolvers = Object.values(registry.operandResolvers).map(
		({ kind }) => ({ kind })
	);

	// Validation rules: default + registered (names only for now)
	const defaultRuleNames = listDefaultValidationRules();
	const extensionRuleNames = registry.validationRules.map(
		(r) => r.name || "anonymousRule"
	);

	return {
		manifestVersion: "1.0.0",
		nodeKinds,
		actionKinds,
		comparators,
		operandResolvers,
		validationRuleNames: [...defaultRuleNames, ...extensionRuleNames],
	};
}

/**
 * Compile a JSON Schema describing the Automation structure, tailored to the current registry
 * (e.g., enumerations for comparator IDs and node types), plus a capabilities manifest.
 */
export function compileAutomationSchema(
	registry: Registry,
	options: CompileOptions = {}
): CompiledSchemaOutput {
	const draftMap: Record<NonNullable<CompileOptions["draft"]>, string> = {
		"2020-12": "https://json-schema.org/draft/2020-12/schema",
		"2019-09": "https://json-schema.org/draft/2019-09/schema",
		"07": "http://json-schema.org/draft-07/schema#",
	};
	const $schema = draftMap[options.draft ?? "2020-12"];

	const unaryComparators = Object.values(registry.comparators)
		.filter((c) => c.arity === 1)
		.map((c) => c.id);
	const binaryComparators = Object.values(registry.comparators)
		.filter((c) => c.arity === 2)
		.map((c) => c.id);
	const actionKindEnum = Object.keys(registry.actionKinds);
	const operandResolverKinds = Object.keys(registry.operandResolvers);

	// Precompute action params map for $defs
	const actionParams: Record<string, unknown> = {};
	for (const [k, def] of Object.entries(registry.actionKinds)) {
		if ((def as { schema?: unknown }).schema)
			actionParams[k] = (def as { schema: unknown }).schema;
	}

	// Shared definitions
	const defs = {
		actionParams,
		Operand: {
			oneOf: [
				{
					type: "object",
					required: ["kind", "value"],
					properties: {
						kind: { const: "const" },
						value: {},
					},
					additionalProperties: false,
				},
				{
					type: "object",
					required: ["kind", "path"],
					properties: {
						kind: { const: "var" },
						path: { type: "string" },
					},
					additionalProperties: false,
				},
				{
					type: "object",
					required: ["kind", "key"],
					properties: {
						kind: { const: "context" },
						key: { type: "string" },
					},
					additionalProperties: false,
				},
				// Fn and resolver combined form with conditional-like anyOf
				{
					type: "object",
					required: ["kind"],
					properties: {
						kind: { enum: ["fn", ...operandResolverKinds] },
						fnId: { enum: operandResolverKinds },
						args: { type: "array" },
					},
					anyOf: [
						{
							properties: {
								kind: { enum: operandResolverKinds },
							},
						},
						{
							properties: { kind: { const: "fn" } },
							required: ["fnId"],
						},
					],
					additionalProperties: true,
				},
			],
		},
		ConditionNode: {
			oneOf: [
				// Binary comparator condition
				{
					type: "object",
					required: ["type", "comparator", "left", "right"],
					properties: {
						type: { const: "condition" },
						comparator: { enum: binaryComparators },
						left: { $ref: "#/$defs/Operand" },
						right: { $ref: "#/$defs/Operand" },
					},
					additionalProperties: false,
				},
				// Unary comparator condition
				{
					type: "object",
					required: ["type", "comparator", "left"],
					properties: {
						type: { const: "condition" },
						comparator: { enum: unaryComparators },
						left: { $ref: "#/$defs/Operand" },
					},
					additionalProperties: false,
				},
				// Group condition
				{
					type: "object",
					required: ["type", "op", "children"],
					properties: {
						type: { const: "group" },
						op: { enum: ["AND", "OR"] },
						children: {
							type: "array",
							items: { $ref: "#/$defs/ConditionNode" },
							minItems: 1,
						},
					},
					additionalProperties: false,
				},
			],
		},
		EdgeCondition: {
			type: "object",
			required: ["root"],
			properties: { root: { $ref: "#/$defs/ConditionNode" } },
			additionalProperties: false,
		},
		ActionNode: {
			type: "object",
			required: ["id", "type", "action"],
			properties: {
				id: { type: "string" },
				type: { const: "action" },
				name: { type: "string" },
				notes: { type: "string" },
				action: {
					type: "object",
					required: ["kind"],
					properties: {
						// Keep kind enum for discoverability; oneOf below enforces stricter params
						kind: actionKindEnum.length
							? { enum: actionKindEnum }
							: { type: "string" },
						params: { type: "object" },
					},
					additionalProperties: true,
					oneOf: (() => {
						const variants: Array<Record<string, unknown>> = [];
						const withSchema = Object.entries(registry.actionKinds)
							.filter(
								([, def]) =>
									(def as { schema?: unknown }).schema
							)
							.map(([k]) => ({
								properties: {
									kind: { const: k },
									params: {
										$ref: `#/$defs/actionParams/${k}`,
									},
								},
								required: ["kind"],
								additionalProperties: true,
							}));
						variants.push(...withSchema);
						const withoutSchemaKinds = Object.entries(
							registry.actionKinds
						)
							.filter(
								([, def]) =>
									!(def as { schema?: unknown }).schema
							)
							.map(([k]) => k);
						if (withoutSchemaKinds.length) {
							variants.push({
								properties: {
									kind: { enum: withoutSchemaKinds },
									params: { type: "object" },
								},
								required: ["kind"],
								additionalProperties: true,
							});
						}
						if (!variants.length) {
							variants.push({
								properties: {
									kind: { type: "string" },
									params: { type: "object" },
								},
								required: ["kind"],
								additionalProperties: true,
							});
						}
						return variants;
					})(),
				},
			},
			additionalProperties: true,
		},
		DecisionNode: {
			type: "object",
			required: ["id", "type", "branches"],
			properties: {
				id: { type: "string" },
				type: { const: "decision" },
				name: { type: "string" },
				notes: { type: "string" },
				branches: {
					type: "array",
					minItems: 1,
					items: {
						type: "object",
						required: ["id", "to"],
						properties: {
							id: { type: "string" },
							to: { type: "string" },
							condition: { $ref: "#/$defs/EdgeCondition" },
						},
						additionalProperties: false,
					},
				},
				defaultTo: { type: "string" },
			},
			additionalProperties: false,
		},
		ParallelNode: {
			type: "object",
			required: ["id", "type", "branches"],
			properties: {
				id: { type: "string" },
				type: { const: "parallel" },
				name: { type: "string" },
				notes: { type: "string" },
				branches: {
					type: "array",
					minItems: 2,
					items: {
						type: "object",
						required: ["id", "start"],
						properties: {
							id: { type: "string" },
							start: { type: "string" },
						},
						additionalProperties: false,
					},
				},
				join: {
					type: "object",
					properties: {
						strategy: { enum: ["waitAll", "waitAny", "count"] },
						count: { type: "number", minimum: 1 },
					},
					additionalProperties: false,
				},
				to: { type: "string" },
			},
			additionalProperties: false,
			oneOf: [
				{ not: { required: ["join"] } },
				{
					properties: {
						join: {
							properties: { strategy: { const: "count" } },
							required: ["count"],
						},
					},
				},
				{
					properties: {
						join: {
							properties: {
								strategy: { enum: ["waitAll", "waitAny"] },
							},
							not: { required: ["count"] },
						},
					},
				},
			],
		},
		WaitNode: {
			type: "object",
			required: ["id", "type", "wait"],
			properties: {
				id: { type: "string" },
				type: { const: "wait" },
				name: { type: "string" },
				notes: { type: "string" },
				wait: {
					type: "object",
					required: ["kind"],
					properties: {
						kind: { enum: ["duration", "until"] },
						durationMs: { type: "number", minimum: 1 },
						untilTimestamp: { type: "string" },
					},
					additionalProperties: false,
				},
				to: { type: "string" },
			},
			additionalProperties: false,
			oneOf: [
				{
					properties: {
						wait: {
							properties: { kind: { const: "duration" } },
							required: ["kind", "durationMs"],
						},
					},
				},
				{
					properties: {
						wait: {
							properties: { kind: { const: "until" } },
							required: ["kind", "untilTimestamp"],
						},
					},
				},
			],
		},
		EndNode: {
			type: "object",
			required: ["id", "type"],
			properties: {
				id: { type: "string" },
				type: { const: "end" },
				name: { type: "string" },
				notes: { type: "string" },
			},
			additionalProperties: false,
		},
		AnyNode: {
			oneOf: [
				{ $ref: "#/$defs/ActionNode" },
				{ $ref: "#/$defs/DecisionNode" },
				{ $ref: "#/$defs/ParallelNode" },
				{ $ref: "#/$defs/WaitNode" },
				{ $ref: "#/$defs/EndNode" },
			],
		},
		Edge: {
			type: "object",
			required: ["id", "from", "to"],
			properties: {
				id: { type: "string" },
				from: { type: "string" },
				to: { type: "string" },
				condition: { $ref: "#/$defs/EdgeCondition" },
			},
			additionalProperties: false,
		},
		Trigger: {
			type: "object",
			required: ["id", "event"],
			properties: {
				id: { type: "string" },
				name: { type: "string" },
				event: { type: "string" },
				filter: { $ref: "#/$defs/ConditionNode" },
				throttle: {
					type: "object",
					required: ["intervalMs", "maxInInterval"],
					properties: {
						intervalMs: { type: "number", minimum: 1 },
						maxInInterval: { type: "number", minimum: 1 },
					},
					additionalProperties: false,
				},
			},
			additionalProperties: false,
		},
		VersionInfo: {
			type: "object",
			required: ["major", "minor", "patch"],
			properties: {
				major: { type: "number" },
				minor: { type: "number" },
				patch: { type: "number" },
				label: { type: "string" },
			},
			additionalProperties: false,
		},
		AutomationMeta: {
			type: "object",
			required: ["id", "name"],
			properties: {
				id: { type: "string" },
				name: { type: "string" },
				description: { type: "string" },
				version: { $ref: "#/$defs/VersionInfo" },
				createdAt: { type: "string" },
				updatedAt: { type: "string" },
			},
			additionalProperties: false,
		},
		Graph: {
			type: "object",
			required: ["nodes"],
			properties: {
				nodes: {
					type: "array",
					items: { $ref: "#/$defs/AnyNode" },
					minItems: 1,
				},
				edges: { type: "array", items: { $ref: "#/$defs/Edge" } },
			},
			additionalProperties: false,
		},
	} as const;

	const schema: Record<string, unknown> = {
		$schema,
		$id: options.schemaId,
		title: "Automation",
		type: "object",
		required: ["meta", "rootNodeId", "graph", "triggers"],
		properties: {
			meta: { $ref: "#/$defs/AutomationMeta" },
			rootNodeId: { type: "string" },
			graph: { $ref: "#/$defs/Graph" },
			triggers: { type: "array", items: { $ref: "#/$defs/Trigger" } },
		},
		additionalProperties: false,
		$defs: defs,
	};

	const manifest = buildCapabilitiesManifest(registry);
	return { schema, manifest };
}

// Small DX helper: bundle schema + manifest + a given automation instance.
export function compileAutomationBundle(
	automation: import("../core/types").Automation,
	registry: Registry,
	options: CompileOptions = {}
) {
	const { schema, manifest } = compileAutomationSchema(registry, options);
	return { schema, manifest, automation };
}
