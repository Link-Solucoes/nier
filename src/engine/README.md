# Engine (Assíncrona por design)

-   Core desacoplado de filas; use adapters.
-   Modos: per-flow (um job por execução), per-node (um job por nó), hybrid (combinações ao seu critério).

## Conceitos

-   SchedulerAdapter: `scheduleFlow`, `scheduleNode`.
-   InlineSchedulerAdapter: útil para testes/dev.
-   Eventos: flowStarted, nodeScheduled, nodeCompleted(result?), decisionMultiMatch, nodeErrored, flowCompleted.
-   Registry ActionKinds pode definir `execute(params, ctx)` para ações.

## Uso básico

```ts
import { createEngine, InlineSchedulerAdapter } from ".";

const engine = createEngine({
	runtime: {
		registry: coreRegistry,
		onEvent: (e) => {
			if (e.type === "nodeCompleted") {
				console.log("nodeCompleted", e.nodeId, e.result);
			} else if (e.type === "nodeErrored") {
				console.error("nodeErrored", e.nodeId, e.error.message);
			} else {
				console.log(e);
			}
		},
	},
	scheduler: new InlineSchedulerAdapter({
		onFlowJob: async ({ executionId }) => {
			/* implemente loop do fluxo */
		},
		onNodeJob: async ({ executionId, nodeId }) => {
			/* chame handleNodeJob */
		},
	}),
});

engine.startFlowPerNode({ automation, executionId: "exec_1" });
```

## Operand resolvers

-   Comparators recebem operandos já resolvidos em runtime. A resolução ocorre via `registry.operandResolvers` com fallbacks:
    -   `const`: retorna o valor diretamente
    -   `var`: busca por path em `exec`, depois `user.data`, depois `flow`
    -   `context`: busca por chave de nível superior em `exec`, `user.data`, `flow`
    -   `fn`: usa um resolver registrado com `kind` igual ao `fnId`

## Adapters de fila (ex: BullMQ)

Implemente `EngineSchedulerAdapter` e conecte `onNodeJob`/`onFlowJob` nos processadores de fila.
