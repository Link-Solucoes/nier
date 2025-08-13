# Registry de Extensão

Fornece pontos de extensão para a engine.

## Estrutura

```ts
interface Registry {
	nodeKinds: Record<string, NodeKindDefinition>;
	actionKinds: Record<string, ActionKindDefinition>;
	comparators: Record<string, ComparatorDefinition>;
	operandResolvers: Record<string, OperandResolverDefinition>;
	validationRules: ValidationRule[];
}
```

## Helpers DX

-   `createNodeKind(def)` valida `kind` presente.
-   `createActionKind(def)` idem para ações.
-   `createComparator(def)` valida arity (1 ou 2).
-   `createOperandResolver(def)` garante função resolve.
-   `withValidationRules(registry, rules)` adiciona regras extras.
-   `mergeRegistry(base, extra, { override })` controla conflitos.

## Exemplo

```ts
import {
	createRegistry,
	createComparator,
	withValidationRules,
	mergeRegistry,
	createActionKind,
	createOperandResolver,
} from "...";

const extra = createRegistry({
	comparators: [
		createComparator({
			id: "STARTS_WITH",
			arity: 2,
			eval: async ([a, b]) => String(a).startsWith(String(b)),
		}),
	],
});

const reg = mergeRegistry(coreRegistry, extra, { override: false });
```
