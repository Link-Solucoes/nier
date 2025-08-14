# @linksolucoes/nier

Engine de automações baseada em grafos (DAG) para orquestrar fluxos com nós de ação, decisão, paralelismo e espera. Focada em tipagem forte, validação configurável e extensibilidade via registries (actions, comparators, operand resolvers).

Status: experimental/alpha. A API pode mudar sem aviso até v1.

## Índice

-   Conceitos rápidos
-   Instalação
-   Exemplo mínimo (end-to-end)
-   Tipos principais (modelo de domínio)
-   Validação (validateAutomation)
-   Engine (execução, eventos e scheduler)
    -   Retries/backoff e histórico
-   Registry (extensão: actions, comparators, operands)
-   Operands e resolução de valores
-   Índices derivados de grafo
-   Exemplos adicionais
-   Schema compiler (JSON Schema + Manifest)
-   Roadmap e limitações
-   Contribuição e licença
-   Triggers (conceito e helper)

## Conceitos rápidos

-   Automation: conjunto com grafo e triggers; fluxo começa em `rootNodeId`.
-   Graph: nós dirigidos (DAG) de tipos: action, decision, parallel, wait, end.
-   Decision: avalia condições (comparators/operands) e segue a primeira branch verdadeira; se nenhuma, usa `defaultTo`.
-   Parallel: abre múltiplos ramos e depois faz “join” (waitAll | waitAny | count) antes de seguir para `to`.
-   Wait: aguarda duração ou timestamp antes de seguir.
-   Registry: catálogo extensível com comparators, actions, resolvers, e regras de validação adicionais.

Princípios: tipos primeiro; funções puras onde possível; zero dependências externas no core; validação “fail fast”; extensibilidade controlada.

## Instalação

Pacote (planejado):

```sh
pnpm add @linksolucoes/nier
# ou
npm i @linksolucoes/nier
# ou
yarn add @linksolucoes/nier
```

Requisitos sugeridos: Node 18+, TypeScript 5.5+. O core não possui dependências de runtime.

## Exemplo mínimo (end-to-end)

Fluxo: action → decision (usa comparators) → wait/parallel → end. Executa com um scheduler inline.

```ts
import {
	coreRegistry,
	createComparator,
	createEngine,
	createRegistry,
	InlineSchedulerAdapter,
	InMemoryExecutionStore,
	mergeRegistry,
	type Automation,
} from "@linksolucoes/nier";

// 1) Comparators concretos
const eq = createComparator({
	id: "EQ",
	arity: 2,
	eval: async ([a, b]) => a === b,
});
const lt = createComparator({
	id: "LT",
	arity: 2,
	eval: async ([a, b]) => Number(a) < Number(b),
});
const registry = mergeRegistry(
	coreRegistry,
	createRegistry({ comparators: [eq, lt] })
);

// 2) Action kind simples
registry.actionKinds["log"] = {
	kind: "log",
	execute: async (params) => {
		console.log("[log]", params);
		return { status: "ok", data: params };
	},
};

// 3) Definição do fluxo
const automation: Automation = {
	meta: { id: "auto_1", name: "Exemplo" },
	rootNodeId: "start",
	graph: {
		nodes: [
			{
				id: "start",
				type: "action",
				action: { kind: "log", params: { msg: "start" } },
			},
			{
				id: "check",
				type: "decision",
				branches: [
					{
						id: "low",
						to: "waitShort",
						condition: {
							root: {
								type: "condition",
								comparator: "LT",
								left: { kind: "var", path: "user.score" },
								right: { kind: "const", value: 10 },
							},
						},
					},
				],
				defaultTo: "parallel",
			},
			{
				id: "waitShort",
				type: "wait",
				wait: { kind: "duration", durationMs: 50 },
				to: "end",
			},
			{
				id: "parallel",
				type: "parallel",
				branches: [
					{ id: "b1", start: "p1" },
					{ id: "b2", start: "p2" },
				],
				join: { strategy: "waitAll" },
				to: "end",
			},
			{
				id: "p1",
				type: "action",
				action: { kind: "log", params: { branch: 1 } },
			},
			{
				id: "p2",
				type: "action",
				action: { kind: "log", params: { branch: 2 } },
			},
			{ id: "end", type: "end" },
		],
		edges: [{ id: "e1", from: "start", to: "check" }],
	},
	triggers: [],
};

// 4) Engine + scheduler inline
const store = new InMemoryExecutionStore();
const engine = createEngine({
	runtime: {
		registry,
		store,
		onEvent: (e) => console.log("[event]", e),
	},
	scheduler: new InlineSchedulerAdapter({
		onFlowJob: async () => {},
		onNodeJob: async ({ executionId, nodeId }) => {
			await engine.handleNodeJob({
				automation,
				executionId,
				nodeId,
				userData: { score: 5 },
			});
		},
	}),
});

await engine.startFlowPerNode({ automation, executionId: "exec_1" });
```

Dica: um exemplo equivalente está em `src/examples/basic.ts`.

## Tipos principais (modelo de domínio)

-   Nodes (`type`):
    -   action: `{ id, type: 'action', action: { kind, params? } }`
    -   decision: `{ id, type: 'decision', branches: Array<{ id, to, condition? }>, defaultTo? }`
    -   parallel: `{ id, type: 'parallel', branches: Array<{ id, start }>, join?: { strategy: 'waitAll'|'waitAny'|'count', count? }, to? }`
    -   wait: `{ id, type: 'wait', wait: { kind: 'duration'|'until', durationMs?, untilTimestamp? }, to? }`
    -   end: `{ id, type: 'end' }`
-   Edges opcionais: `{ id, from, to, condition? }` (action → … via edges explícitas).
-   Conditions:
    -   ConditionNode: `group` com `op: AND|OR` e `children`, ou `condition` com `comparator`, `left` e `right?`.
    -   Operands: `const | var | context | fn`.
-   Automation: `{ meta, rootNodeId, graph, triggers }`.

Tudo isso está tipado e exportado de `src/core/types.ts` (barrel em `src/index.ts`).

## Validação (validateAutomation)

Função: `validateAutomation({ automation, registry, indices?, options?, extraRules? })` → `{ valid, issues, summary }`.

-   Regras inclusas (base):
    -   Básicas: root presente e existente, IDs únicos para nodes/edges/triggers, endpoints de edges válidos.
    -   Estruturais: alcançabilidade (via root), detecção de ciclos, requisitos de decision/parallel/wait, throttle de triggers.
    -   Conditions: comparators conhecidos, aviso de possível multi-match em decision sem default.
-   Extensão: `withValidationRules(registry, rules)` agrega regras custom ao `registry` para serem aplicadas.
-   Utils: `listDefaultValidationRules()` retorna os nomes de regras padrão.

Exemplo:

```ts
import { validateAutomation, coreRegistry } from "@linksolucoes/nier";
const result = validateAutomation({ automation, registry: coreRegistry });
if (!result.valid) {
	console.error(result.issues);
}
```

Issue shape: `{ level: 'error'|'warning'|'info', code, message, context? }`.

## Engine (execução, eventos e scheduler)

Criação: `createEngine({ runtime, scheduler })`.

-   runtime:
    -   `registry`: Registry em uso (actions/comparators etc.).
    -   `store?`: Persistência de estado (default: nenhuma). Fornecemos `InMemoryExecutionStore` para dev/test.
    -   `onEvent?`: Handler de eventos de execução (observabilidade leve).
-   scheduler (adapter):
    -   `scheduleNode({ executionId, nodeId, delayMs? })`
    -   `scheduleFlow({ executionId, delayMs? })`
    -   Adapter pronto: `InlineSchedulerAdapter({ onNodeJob, onFlowJob })` para execuções em memória.

Métodos:

-   `startFlow({ automation, executionId })`: agenda um job por fluxo (consumidor chama `onFlowJob`).
-   `startFlowPerNode({ automation, executionId })`: agenda o primeiro node como job.
-   `handleNodeJob({ automation, executionId, nodeId, userData? })`: processa um job de node (chamado pelo adapter).

Eventos emitidos (`EngineEvent`):

-   `flowStarted`, `flowCompleted`.
-   `nodeScheduled`, `nodeCompleted { result? }`, `nodeErrored { error }`.
-   `decisionMultiMatch { matchedBranchIds }` quando múltiplas branches seriam verdadeiras (o engine segue a primeira).
-   `edgeMultiMatch { toNodeIds }` quando múltiplas edges condicionais a partir de um action são verdadeiras (todas são agendadas).
-   `nodeRetryScheduled { attempt, delayMs }` quando um retry é agendado para uma action.

Semânticas relevantes demonstradas nos testes (Vitest):

-   Decision: escolhe a primeira branch com condição verdadeira; se nenhuma, usa `defaultTo`.
-   Parallel join:
    -   `waitAll`: dispara `to` quando todos os ramos finalizam.
    -   `waitAny`: dispara após o primeiro ramo finalizar.
    -   `count`: dispara quando `completed >= count`.
-   Wait: `duration` reagenda o próximo node com `delayMs`; `until` calcula `delayMs` até o timestamp.

### Retries/backoff (ações) e histórico

-   Configure por action em `registry.actionKinds[kind].retry`:
    -   `maxAttempts` (padrão 1)
    -   `backoffMs` (padrão 0)
-   Quando uma action retorna `{ status: 'error' }`, o engine não segue as edges e agenda um retry até atingir `maxAttempts` (emite `nodeRetryScheduled`).
-   Quando a action lança exceção, o engine emite `nodeErrored`, persiste `state.data.__lastError` e também agenda retry se configurado.
-   Contador de tentativas: `state.exec.attempts[nodeId]`.
-   Histórico opcional: habilite `runtime.options.enableHistory = true` para gravar `nodeScheduled`, `nodeCompleted`, `nodeErrored`, `flowCompleted` em `state.history`.

Exemplo completo: veja `src/examples/retry-history.ts`.

## Registry (extensão)

Criação e composição:

-   `createRegistry({ nodeKinds?, actionKinds?, comparators?, operandResolvers? })`
-   `mergeRegistry(base, extra, { override = true })`
-   `coreRegistry` com node kinds básicos e comparators stub (substitua/estenda com suas implementações).

Factories de conveniência (validações leves):

-   `createComparator({ id, arity, eval })`
-   `createActionKind({ kind, execute, ... })`
-   `createNodeKind({ kind, ... })`
-   `createOperandResolver({ kind, resolve })`
-   `withValidationRules(registry, [ruleA, ruleB])`

Action executor: `(params, ctx) => Promise<{ status: 'ok'|'error', data?, error? }>`.

## Operands e resolução de valores

Usados principalmente em conditions (decision/edges/triggers):

-   `const`: usa `value` literal.
-   `var`: busca por caminho com precedência: `exec` → `user.data` → `flow`.
    -   Prefixos explícitos suportados: `exec.`, `user.`, `flow.`.
-   `context`: busca de nível superior por `key` em `exec` → `user.data` → `flow`.
-   `fn`: resolve via `registry.operandResolvers[fnId]` (custom).

Helpers de runtime (internos): `resolveOperand`, `resolveOperands`.

## Índices derivados de grafo

`buildIndices(graph)` → `{ outgoing, incoming, inDegree, outDegree, nodeMap }`.

-   Edges explícitas e conexões implícitas por tipo de node (decision/defaultTo, parallel/branches/to, wait/to).
-   Útil para validação e execução.

## Exemplos adicionais

-   `src/examples/basic.ts`: fluxo com log, decision por `LT`, wait de 50ms, paralelismo com `waitAll`.
-   Testes em `src/engine/__tests__`: cobrem decisão (multi-match), estratégias de join, e wait + parallel.

## Schema compiler (JSON Schema + Manifest)

Por que: gerar um JSON Schema do modelo de Automation para ótima DX (autocomplete/validadores no editor) e consumo por front-ends/LLMs. Também exporta um Manifest de capacidades derivado do seu `registry` (actions, comparators, operand resolvers, regras de validação).

APIs:

-   `compileAutomationSchema(registry, options?)` → `{ schema, manifest }`
-   `compileAutomationBundle(automation, registry, options?)` → `{ schema, manifest, automation }`

Options aceitas:

-   `schemaId?`: define `$id` no JSON Schema gerado.
-   `draft?`: versão do draft (`"2020-12"` padrão).

O que o Manifest contém (resumo):

-   `nodeKinds`: `{ kind, category?, description? }[]`
-   `actionKinds`: `{ kind, displayName?, category?, schema? }[]` (schema é repassado para validar `action.params` daquela kind)
-   `comparators`: `{ id, arity }[]`
-   `operandResolvers`: `{ kind }[]`
-   `validationRuleNames`: `string[]`

Como usar (exemplo rápido):

```ts
import {
	coreRegistry,
	createActionKind,
	createRegistry,
	mergeRegistry,
	compileAutomationSchema,
	compileAutomationBundle,
} from "@linksolucoes/nier";

const sendEmail = createActionKind({
	kind: "send_email",
	schema: {
		type: "object",
		required: ["templateId", "to"],
		properties: { templateId: { type: "string" }, to: { type: "string" } },
	},
});
const registry = mergeRegistry(
	coreRegistry,
	createRegistry({ actionKinds: [sendEmail] })
);

const { schema, manifest } = compileAutomationSchema(registry, {
	schemaId: "https://example.com/schemas/automation.json",
});

// Ou com a Automation embutida
const bundle = compileAutomationBundle(
	{
		/* ...Automation... */
	} as any,
	registry
);
```

Detalhes de validação no schema:

-   `ActionNode.action.params` é validado com base no `schema` do action kind correspondente (quando fornecido), via `oneOf`.
-   `ConditionNode` diferencia comparadores unários e binários (com/sem `right`).
-   `Operand` inclui `kind: "fn"` e também os `operandResolvers` do registry; quando `kind == "fn"` exige `fnId` válido.
-   `ParallelNode.join` e `WaitNode.wait` usam `oneOf` para exigir os campos apropriados por estratégia/kind.

Veja o exemplo completo em `src/examples/schema-compiler.ts`.

## Triggers (conceito e helper)

Triggers são a forma de iniciar execuções quando eventos ocorrem no seu sistema. A arquitetura de escuta e despacho é responsabilidade do usuário (ex.: NestJS event listeners, filas, webhooks). Para melhorar a DX, a biblioteca oferece um helper para criar handlers fortemente tipados que avaliam filtros opcionais e retornam `executionId` para iniciar o fluxo.

API:

-   `createTriggerHelper({ id, event, filter?, exec })` → `{ event, handle(evt, runtime) }`
    -   `filter?`: `ConditionNode` avaliado com os comparators do `registry`.
    -   `exec`: `{ makeExecutionId(evt), selectAutomation(evt), mapUserData?(evt), mode? }`.
    -   `handle` retorna `{ started: boolean, executionId? }`.

Exemplo (pseudocódigo):

```ts
import { createTriggerHelper, createComparator, createRegistry, mergeRegistry, coreRegistry } from "@linksolucoes/nier";
import { createEngine, InlineSchedulerAdapter, InMemoryExecutionStore } from "@linksolucoes/nier";

// Comparators reais
const eq = createComparator({ id: "EQ", arity: 2, eval: async ([a, b]) => a === b });
const registry = mergeRegistry(coreRegistry, createRegistry({ comparators: [eq] }));

// Sua automation
const automation = /* ... */;

// Engine (per-node)
const store = new InMemoryExecutionStore();
const engine = createEngine({
	runtime: { registry, store, onEvent: (e) => console.log(e) },
	scheduler: new InlineSchedulerAdapter({
		onNodeJob: async ({ executionId, nodeId }) => engine.handleNodeJob({ automation, executionId, nodeId }),
		onFlowJob: async () => {},
	}),
});

// Helper
const userCreated = createTriggerHelper<{ kind: string; id: string }>({
	id: "t_user_created",
	event: "user.created",
	filter: { type: "condition", comparator: "EQ", left: { kind: "var", path: "user.kind" }, right: { kind: "const", value: "user.created" } },
	exec: {
		makeExecutionId: (e) => `exec_${e.id}`,
		selectAutomation: () => automation,
		mapUserData: (e) => ({ kind: e.kind, user: { id: e.id } }),
		mode: "per-node",
	},
});

// Listener no seu app
async function onUserEvent(evt: { kind: string; id: string }) {
	const res = await userCreated.handle(evt, engine.runtime);
	if (res.started) {
		// Inicie o fluxo de fato
		await engine.startFlowPerNode({ automation, executionId: res.executionId! });
	}
}
```

### Checks externos nas condições (seu sistema)

Você pode consultar dados do seu sistema nas condições usando operand resolvers do tipo `fn` (assíncronos). Exemplo:

```ts
import {
	createOperandResolver,
	createRegistry,
	mergeRegistry,
	coreRegistry,
} from "@linksolucoes/nier";

// Resolver que calcula dias desde o cadastro via repositório/cliente externo
const daysSinceSignup = createOperandResolver({
	kind: "days_since_signup", // usado como fnId nas condições
	resolve: async (_operand, runtime) => {
		const userId = runtime.user.data.userId as string;
		const createdAt = await repo.getUserCreatedAt(userId);
		const ms = Date.now() - new Date(createdAt).getTime();
		return Math.floor(ms / 86_400_000);
	},
});

const reg = mergeRegistry(
	coreRegistry,
	createRegistry({ operandResolvers: [daysSinceSignup] })
);

// Condition: days_since_signup > 5
const filter = {
	type: "condition",
	comparator: "GT",
	left: { kind: "fn", fnId: "days_since_signup" },
	right: { kind: "const", value: 5 },
} as const;
```

Também é válido pré-computar e passar via `mapUserData` (ex.: `daysSinceSignup`) e então usar `var` com `user.daysSinceSignup`.

## Roadmap e limitações

-   Triggers: tipos e helper presentes; orquestração/event bus é responsabilidade do usuário.
-   Observabilidade: eventos básicos; futuras métricas e spans.
-   Retries/backoff em actions: somente tipado; não implementado.
-   Validação de schema de params: planejado (ex.: integração com zod/validador externo — fora do core).
-   Serialização/versão de automations e índices incrementais: backlog.
