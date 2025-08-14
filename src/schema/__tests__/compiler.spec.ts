import { describe, expect, it } from "vitest";
import type { Automation } from "../../core/types";
import {
	coreRegistry,
	createComparator,
	createOperandResolver,
	createRegistry,
	mergeRegistry,
} from "../../registry/registry";
import { compileAutomationBundle, compileAutomationSchema } from "../../schema/compiler";

describe("schema compiler", () => {
	it("builds manifest from registry", () => {
		const gt = createComparator({
			id: "GT",
			arity: 2,
			eval: async () => true,
		});
		const reg = createRegistry({ comparators: [gt] });
		const merged = mergeRegistry(coreRegistry, reg);
		const { manifest } = compileAutomationSchema(merged);
		const compIds = manifest.comparators.map((c) => c.id);
		expect(compIds).toContain("GT");
		expect(manifest.nodeKinds.length).toBeGreaterThan(0);
		expect(Array.isArray(manifest.validationRuleNames)).toBe(true);
	});

	it("includes comparator enum in ConditionNode", () => {
		const CUSTOM = createComparator({
			id: "CUSTOM",
			arity: 2,
			eval: async () => true,
		});
		const reg = createRegistry({ comparators: [CUSTOM] });
		const merged = mergeRegistry(coreRegistry, reg);
		const { schema } = compileAutomationSchema(merged);
		// Navigate to comparator enum with typed access
		const defs = (schema as { $defs: Record<string, unknown> }).$defs;
		const conditionNode = defs["ConditionNode"] as {
			oneOf: Array<{
				properties?: {
					type?: { const?: string };
					comparator?: { enum?: string[] };
				};
			}>;
		};
		const cond = conditionNode.oneOf.find((x) => x.properties?.type?.const === "condition");
		expect(cond?.properties?.comparator?.enum).toContain("CUSTOM");
	});

	it("includes action kinds in ActionNode schema when present", () => {
		const reg = createRegistry({ actionKinds: [{ kind: "send_email" }] });
		const merged = mergeRegistry(coreRegistry, reg);
		const { schema } = compileAutomationSchema(merged);
		const defs = (schema as { $defs: Record<string, unknown> }).$defs;
		const actionNode = defs["ActionNode"] as {
			properties: {
				action: { properties: { kind: { enum?: string[] } } };
			};
		};
		const kind = actionNode.properties.action.properties.kind;
		expect(kind.enum).toContain("send_email");
	});

	it("includes operand resolvers in manifest and operand kind enum", () => {
		const custom = createOperandResolver({
			kind: "days_since_signup",
			resolve: async () => 42,
		});
		const reg = createRegistry({ operandResolvers: [custom] });
		const merged = mergeRegistry(coreRegistry, reg);
		const { schema, manifest } = compileAutomationSchema(merged);
		// Manifest contains resolver kind
		const kinds = manifest.operandResolvers.map((o) => o.kind);
		expect(kinds).toContain("days_since_signup");
		// Schema operand kind includes fn and custom kinds
		const defs = (schema as { $defs: Record<string, unknown> }).$defs;
		const operand = defs["Operand"] as {
			oneOf: Array<{ properties?: { kind?: { enum?: string[] } } }>;
		};
		const variant = operand.oneOf.find((o) => Array.isArray(o.properties?.kind?.enum)) as
			| { properties?: { kind?: { enum?: string[] } } }
			| undefined;
		expect(variant?.properties?.kind?.enum).toEqual(expect.arrayContaining(["fn", "days_since_signup"]));
	});

	it("defines condition groups with recursive children", () => {
		const { schema } = compileAutomationSchema(coreRegistry);
		const defs = (schema as { $defs: Record<string, unknown> }).$defs;
		const conditionNode = defs["ConditionNode"] as {
			oneOf: Array<{
				properties?: {
					type?: { const?: string };
					op?: { enum: ["AND", "OR"] };
					children?: { items: { $ref: string } };
				};
			}>;
		};
		const group = conditionNode.oneOf.find((x) => x.properties?.type?.const === "group");
		expect(group?.properties?.op?.enum).toEqual(["AND", "OR"]);
		expect(group?.properties?.children?.items.$ref).toBe("#/$defs/ConditionNode");
	});

	it("defines parallel join strategy and count constraints", () => {
		const { schema } = compileAutomationSchema(coreRegistry);
		const defs = (schema as { $defs: Record<string, unknown> }).$defs;
		const parallel = defs["ParallelNode"] as {
			properties: {
				join: {
					properties: {
						strategy: { enum: ["waitAll", "waitAny", "count"] };
						count: { minimum: number };
					};
				};
			};
		};
		const join = parallel.properties.join;
		expect(join.properties.strategy.enum).toEqual(["waitAll", "waitAny", "count"]);
		expect(join.properties.count.minimum).toBe(1);
	});

	it("defines wait node shape with duration/until", () => {
		const { schema } = compileAutomationSchema(coreRegistry);
		const defs = (schema as { $defs: Record<string, unknown> }).$defs;
		const wait = defs["WaitNode"] as {
			properties: {
				wait: {
					properties: {
						kind: { enum: ["duration", "until"] };
						durationMs: { minimum: number };
					};
				};
			};
		};
		expect(wait.properties.wait.properties.kind.enum).toEqual(["duration", "until"]);
		expect(wait.properties.wait.properties.durationMs.minimum).toBe(1);
	});

	it("defines trigger throttle and filter condition", () => {
		const { schema } = compileAutomationSchema(coreRegistry);
		const defs = (schema as { $defs: Record<string, unknown> }).$defs;
		const trigger = defs["Trigger"] as {
			properties: {
				throttle: { required: ["intervalMs", "maxInInterval"] };
				filter: { $ref: string };
			};
		};
		expect(trigger.properties.throttle.required).toEqual(["intervalMs", "maxInInterval"]);
		expect(trigger.properties.filter.$ref).toBe("#/$defs/ConditionNode");
	});

	it("graph requires at least 1 node and edges are typed", () => {
		const { schema } = compileAutomationSchema(coreRegistry);
		const defs = (schema as { $defs: Record<string, unknown> }).$defs;
		const graph = defs["Graph"] as {
			properties: { nodes: { minItems: number } };
		};
		expect(graph.properties.nodes.minItems).toBe(1);
		const edge = defs["Edge"] as { required: string[] };
		expect(edge.required).toEqual(["id", "from", "to"]);
	});

	it("exposes $schema and accepts $id via options", () => {
		const { schema } = compileAutomationSchema(coreRegistry, {
			schemaId: "urn:example:automation",
		});
		const s = schema as { $schema: string; $id?: string };
		expect(s.$schema).toContain("json-schema");
		expect(s.$id).toBe("urn:example:automation");
	});

	it("provides compileAutomationBundle returning automation intact", () => {
		const automation: Automation = {
			meta: { id: "a1", name: "Demo" },
			rootNodeId: "n1",
			graph: { nodes: [{ id: "n1", type: "end" }] },
			triggers: [{ id: "t1", event: "e" }],
		};
		const bundle = compileAutomationBundle(automation, coreRegistry);
		expect(bundle.automation).toBe(automation);
		expect(bundle.schema).toBeTruthy();
		expect(bundle.manifest.nodeKinds.length).toBeGreaterThan(0);
	});

	it("falls back to string action kind when no actions in registry", () => {
		const empty = createRegistry({});
		const merged = mergeRegistry(coreRegistry, empty);
		// Remove core actionKinds from merged (if any) to assert fallback
		const noActions = { ...merged, actionKinds: {} } as typeof merged;
		const { schema } = compileAutomationSchema(noActions);
		const defs = (schema as { $defs: Record<string, unknown> }).$defs;
		const actionNode = defs["ActionNode"] as {
			properties: {
				action: {
					properties: { kind: { enum?: string[]; type?: string } };
				};
			};
		};
		expect(actionNode.properties.action.properties.kind.enum).toBeUndefined();
		expect(actionNode.properties.action.properties.kind.type).toBe("string");
	});
});
