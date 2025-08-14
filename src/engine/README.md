# Engine (assíncrona por design)

-   Core desacoplado de filas; pluge um adapter.
-   Modos: per-flow (um job por execução), per-node (um job por nó), hybrid (mistos).

## Conceitos chave

-   SchedulerAdapter: `scheduleFlow`, `scheduleNode`.
-   InlineSchedulerAdapter: útil para testes/dev; respeita `delayMs`.
-   Eventos emitidos:
    -   `flowStarted`, `flowCompleted`.
    -   `nodeScheduled`, `nodeCompleted { result? }`, `nodeErrored { error }`.
    -   `decisionMultiMatch` (múltiplas branches verdadeiras em decision).
    -   `edgeMultiMatch` (múltiplas edges condicionais verdadeiras a partir de um action).
-   Actions: `ActionKind.execute(params, ctx)` opcional, registrada no `registry`.

## Modos de execução

-   Per-node (recomendado para produção): cada nó vira um job independente.
    -   Use `engine.startFlowPerNode({ automation, executionId })`.
    -   Seu adapter chama `engine.handleNodeJob({ automation, executionId, nodeId, userData? })` quando um job chega.
-   Per-flow: um job por execução inteira.
    -   Use `engine.startFlow({ automation, executionId })`.
    -   Você implementa `onFlowJob` no adapter e decide como iterar nós (p.ex., chamar internamente `scheduleNode`).

## Seleção de próximos nós

-   Decision: avalia `branches[].condition` (com grupos AND/OR, operands) e segue a primeira verdadeira; se mais de uma, emite `decisionMultiMatch`; se nenhuma, usa `defaultTo`.
-   Parallel: fan-out para `branches[].start` e realiza join conforme `join.strategy`:
    -   `waitAll`: dispara `to` quando todos os ramos terminam.
    -   `waitAny`: dispara `to` no primeiro ramo que terminar.
    -   `count`: dispara `to` quando `completed >= count`.
-   Wait: reprograma o próximo (`to`) com `delayMs` conforme `wait.kind` (`duration`/`until`).
-   Action → edges condicionais explícitas:
    -   Se existirem edges em `graph.edges` com `from == node.id`, cada edge tem `condition?`.
    -   O engine avalia cada condition; só agenda `to` das edges verdadeiras.
    -   Se múltiplas edges forem verdadeiras, emite `edgeMultiMatch` e agenda todas.

## Resolução de operands e comparators

-   Resolução de operands: `const`, `var` (precedência exec → user.data → flow, com prefixos `exec.`/`user.`/`flow.`), `context` (nível superior), `fn` via `operandResolvers`.
-   Comparators: implementados no `registry` (core inclui EQ, NEQ, GT, LT, EXISTS).

## Erros e persistência de estado

-   Exceções durante execução (ex.: operand resolver) disparam `nodeErrored`.
-   Último erro mínimo é persistido em `state.data.__lastError`.
-   Resultados de ações são salvos em `state.exec.nodeResults[nodeId]`.

## Retries e backoff (ações)

-   Defina por ação no `registry.actionKinds[kind].retry`: - `maxAttempts` (default: 1, ou seja, sem retry) - `backoffMs` (default: 0)
-   Quando uma Action retorna `{ status: "error" }`, o engine não faz fan-out e programa um novo job do mesmo nó se ainda houver tentativas restantes.
-   Quando uma Action lança exceção, o engine emite `nodeErrored`, persiste `__lastError` e também agenda retry se configurado.
-   Evento emitido: `nodeRetryScheduled { nodeId, attempt, delayMs }` a cada reagendamento.
-   Contagem de tentativas fica em `state.exec.attempts[nodeId]` (1 para a primeira execução, 2 para a segunda, etc.).
-   Durante retries, o nó atual não propaga próximos nós; a continuidade só ocorre quando a execução resultar em sucesso (ou quando `maxAttempts` for atingido e não houver próximos a seguir).

Exemplo (registro de ação com retry):

```ts
const registry = createRegistry({
	actionKinds: [
		{
			kind: "sendEmail",
			execute: async (params) => ({
				status: "error",
				error: { message: "mail down" },
			}),
			retry: { maxAttempts: 3, backoffMs: 2000 },
		},
	],
});
```

## Histórico leve (enableHistory)

-   Ative via `engine.runtime.options.enableHistory = true`.
-   Registra eventos essenciais em `state.history: Array<{ type: string; nodeId?: string; at: ISO }>`.
-   Eventos atualmente registrados: `nodeScheduled`, `nodeCompleted`, `nodeErrored`, `flowCompleted`.
-   Útil para depuração rápida e auditoria mínima; para observabilidade avançada, prefira captar `onEvent` e enviar para seu sistema de logs/metrics.

## Exemplo per-node com adapter inline

```ts
import { createEngine, InlineSchedulerAdapter } from "@linksolucoes/nier";

const engine = createEngine({
	runtime: { registry, onEvent: (e) => console.log(e) },
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

## Integração com filas (ex.: BullMQ)

-   Implemente um adapter que atenda `EngineSchedulerAdapter` e, nos processadores da fila:
    -   `scheduleNode` → enfileira um job com `{ executionId, nodeId, delayMs? }`.
    -   `scheduleFlow` → enfileira um job de fluxo e, no consumidor, você decide como orquestrar (p.ex., agendar primeiro nó).

## Dicas

-   Em decisions com múltiplas condições verdadeiras, apenas a primeira (ordem do array) é seguida; use `decisionMultiMatch` para monitorar.
-   Em actions com várias edges verdadeiras, todas serão seguidas; `edgeMultiMatch` ajuda a observar fan-out.
