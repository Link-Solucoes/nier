# Schema compiler

Gera um JSON Schema do modelo `Automation` e um Manifest de capacidades derivado do `registry`. Útil para editores (autocomplete/validação), UIs de desenho de fluxo e LLMs.

## Objetivos

- DX: validação e sugestões no editor a partir do schema.
- Interoperabilidade: front-ends podem renderizar e validar fluxos sem acoplar a engine.
- Observabilidade futura: padronizar representação e versionamento via `$id`.

## APIs

- `compileAutomationSchema(registry, options?)` → `{ schema, manifest }`
- `compileAutomationBundle(automation, registry, options?)` → `{ schema, manifest, automation }`

Options:

- `schemaId?`: injeta `$id` no JSON Schema.
- `draft?`: draft de JSON Schema (default: `2020-12`).

## Saídas

- `schema`: objeto JSON Schema com `$defs` para:
  - `Operand` (const | var | context | fn | resolvers do registry)
  - `ConditionNode` (binário vs. unário via `oneOf`; grupos recursivos)
  - Nós (`Action`, `Decision`, `Parallel`, `Wait`, `End`)
  - `Edge`, `Trigger`, `Graph`, `Meta`
- `manifest`:
  - `nodeKinds`: `{ kind, category?, description? }[]`
  - `actionKinds`: `{ kind, displayName?, category?, schema? }[]`
  - `comparators`: `{ id, arity }[]`
  - `operandResolvers`: `{ kind }[]`
  - `validationRuleNames`: `string[]`

## Regras de validação (highlights)

- `ActionNode.action.params` é validado por kind quando há `schema` registrado (via `oneOf`).
- `ConditionNode` separa comparadores binários (requer `right`) e unários (sem `right`).
- `Operand` suporta `kind: "fn"` exigindo `fnId` (um dos resolvers registrados), além de aceitar `kind` igual ao id de um resolver custom.
- `ParallelNode.join` (count vs waitAll/waitAny) e `WaitNode.wait` (duration vs until) modelados com `oneOf`.

## Exemplo

Veja `src/examples/schema-compiler.ts` para um exemplo completo.

Trecho resumido:

```ts
const sendEmail = createActionKind({
  kind: "send_email",
  schema: {
    type: "object",
    required: ["templateId", "to"],
    properties: { templateId: { type: "string" }, to: { type: "string" } },
  },
});
const registry = mergeRegistry(coreRegistry, createRegistry({ actionKinds: [sendEmail] }));

const { schema, manifest } = compileAutomationSchema(registry, {
  schemaId: "https://example.com/schemas/automation.json",
});
```

## Notas

- O schema evita `if/then` por política de lint, preferindo `oneOf/anyOf`.
- O Manifest apenas reflete o `registry` atual; mudanças no registry mudam o Manifest.
- O core não impõe validador externo para `schema` dos actions; use seu formato preferido.
