import { describe, expect, it } from "vitest";
import type { OperandResolverDefinition } from "../registry";
import {
	coreRegistry,
	createActionKind,
	createComparator,
	createNodeKind,
	createOperandResolver,
	createRegistry,
	mergeRegistry,
	withValidationRules,
} from "../registry";

describe("registry", () => {
	it("mergeRegistry no override throws on conflicts", () => {
		const base = createRegistry({ nodeKinds: [{ kind: "x" }] });
		const extra = createRegistry({ nodeKinds: [{ kind: "x" }] });
		expect(() => mergeRegistry(base, extra, { override: false })).toThrow();
	});

	it("createComparator validates arity", () => {
		expect(() => createComparator({ id: "BAD", arity: 3, eval: async () => true })).toThrow();
	});

	it("create* validators require kind and resolve", () => {
		expect(() => createNodeKind({ kind: "" })).toThrow();
		expect(() => createActionKind({ kind: "" })).toThrow();
		const badResolve = undefined as unknown as OperandResolverDefinition["resolve"];
		expect(() => createOperandResolver({ kind: "", resolve: badResolve })).toThrow();
	});

	it("withValidationRules aggregates rules", () => {
		const base = coreRegistry;
		const added = withValidationRules(base, [() => []]);
		expect(added.validationRules.length).toBe(base.validationRules.length + 1);
	});

	it("createRegistry throws on duplicate definitions", () => {
		expect(() => createRegistry({ nodeKinds: [{ kind: "x" }, { kind: "x" }] })).toThrow();
		expect(() => createRegistry({ actionKinds: [{ kind: "a" }, { kind: "a" }] })).toThrow();
		expect(() =>
			createRegistry({
				comparators: [
					{ id: "EQ", arity: 2, eval: async () => true },
					{ id: "EQ", arity: 2, eval: async () => true },
				],
			}),
		).toThrow();
		expect(() =>
			createRegistry({
				operandResolvers: [
					{ kind: "r", resolve: async () => 1 },
					{ kind: "r", resolve: async () => 1 },
				],
			}),
		).toThrow();
	});
});
