import {
	compileAutomationBundle,
	compileAutomationSchema,
	coreRegistry,
	createActionKind,
	createRegistry,
	mergeRegistry,
} from "..";
import type { Automation } from "../core/types";

// Example: extend registry with one action kind that has a params schema
const sendEmail = createActionKind({
	kind: "send_email",
	displayName: "Send Email",
	category: "notifications",
	schema: {
		type: "object",
		required: ["templateId", "to"],
		properties: {
			templateId: { type: "string" },
			to: { type: "string", format: "email" },
			data: { type: "object" },
		},
		additionalProperties: false,
	},
});

const registry = mergeRegistry(
	coreRegistry,
	createRegistry({ actionKinds: [sendEmail] })
);

// Minimal automation using the action kind above
const automation: Automation = {
	meta: { id: "auto_schema_demo", name: "Schema Compiler Demo" },
	rootNodeId: "n1",
	graph: {
		nodes: [
			{
				id: "n1",
				type: "action",
				action: {
					kind: "send_email",
					params: { templateId: "welcome", to: "user@example.com" },
				},
			},
			{ id: "end", type: "end" },
		],
		edges: [{ id: "e1", from: "n1", to: "end" }],
	},
	triggers: [],
};

async function main() {
	// Option 1: compile only schema + manifest
	const { schema, manifest } = compileAutomationSchema(registry, {
		schemaId: "https://example.com/schemas/automation.json",
	});

	console.log("Schema $id:", (schema as { $id?: string }).$id);
	console.log(
		"Manifest actions:",
		manifest.actionKinds.map((a) => a.kind)
	);

	// Option 2: bundle with the current automation instance
	const bundle = compileAutomationBundle(automation, registry, {
		schemaId: "https://example.com/schemas/automation.json",
	});
	console.log("Bundle:", JSON.stringify(bundle, null, 2));
}

// Only run when executed directly
if (typeof require !== "undefined" && require.main === module) {
	void main();
}
