/** Public types for schema/manifest compilation. */

import type { Registry } from "../registry/registry";

export interface CapabilitiesManifest {
	/** Semantic version for the manifest structure itself. */
	manifestVersion: string; // e.g., "1.0.0"
	/** Snapshot of available node kinds (core + custom) */
	nodeKinds: Array<{
		kind: string;
		category?: string;
		description?: string;
	}>;
	/** Action kinds that clients can invoke on action nodes */
	actionKinds: Array<{
		kind: string;
		displayName?: string;
		category?: string;
		// Free-form params schema provided by extensions (kept as-is)
		schema?: unknown;
		retry?: { maxAttempts?: number; backoffMs?: number };
	}>;
	/** Comparators usable in conditions */
	comparators: Array<{
		id: string;
		arity: number;
	}>;
	/** Operand resolvers available at runtime. For Fn operands, ids map to fnId. */
	operandResolvers: Array<{
		kind: string;
	}>;
	/** Names of validation rules that are active by default + registered. */
	validationRuleNames: string[];
}

export interface CompileOptions {
	/** Optional $id to embed into the JSON Schema */
	schemaId?: string;
	/** JSON Schema draft. Default: 2020-12 */
	draft?: "2020-12" | "2019-09" | "07";
}

export interface CompiledSchemaOutput {
	/** Draft JSON Schema describing the Automation shape tailored to current registry. */
	schema: Record<string, unknown>;
	/** The capabilities manifest derived from the given registry. */
	manifest: CapabilitiesManifest;
}

export type ManifestBuilder = (registry: Registry) => CapabilitiesManifest;
