# Coding Agent Instructions (Lei Operacional)

Documento carregado em TODAS as iterações. Define princípios, padrões e limites para evolução da biblioteca de automações baseada em grafos (DAG). Público alvo: agente de codificação orientado a tarefas incrementais, com foco em clareza, robustez e extensibilidade.

---

## 1. Princípios Fundamentais

- Fonte da Verdade: Tipos e contratos primeiro; implementação depois.
- Imutabilidade Superficial: Estruturas de domínio expostas não devem ser mutadas após construção (usar Object.freeze em DEV futuramente).
- Fail Fast: Erros estruturais devem impedir execução; warnings apenas para otimizações / recomendações.
- Zero Surpresas: Funções puras onde possível. Sem efeitos colaterais implícitos.
- Extensibilidade Controlada: Registry central para novos nodeKinds, actionKinds, comparators, operand resolvers, etc.
- Diferenciar: Dados de definição (estáticos) vs artefatos derivados (índices, caches) vs runtime state (execuções).
- Nenhuma dependência externa no core (somente dev/test tools fora do bundle principal).

---

## 2. Organização de Pastas (Planejada)

```
/src
  /core          -> tipos, builders, índices, validação base
  /registry      -> registries default + utilidades de extensão
  /engine        -> (futuro) execução step-based
  /conditions    -> comparators, operand resolvers
  /actions       -> ações padrão (ex: envio de email stub)
  /validation    -> regras modulares específicas
  /observability -> hooks/event bus (futuro)
  /utils         -> helpers puros
  /examples      -> fluxos demonstrativos
  index.ts       -> barrel export público
```

Regras: Core não importa de engine/observability. Engine pode depender de core + registry + conditions + actions.

---

## 3. Nomenclatura

- Tipos/Interfaces: PascalCase (Automation, Graph, ActionNode).
- IDs: Sufixo Id (nodeId → ao desestruturar; NodeId como tipo).
- Arquivos: kebab-case (action-node.ts, build-adjacency.ts).
- Funções: verboCamel (buildAdjacency, validateAutomation).
- Constantes imutáveis internas: UPPER_SNAKE somente se conceito global (DEFAULT_TIMEOUT_MS); senão camelCase.
- Generics: T, TNode, TActionParams, TContext (claro e específico).
- Namespaces / subpastas para agrupar; evitar prefixos artificiais no nome do arquivo se já em pasta temática.
- Eventos: past tense para concluído (nodeCompleted), present/progressive para início (nodeStarting), exceções (nodeErrored).
- Comparators: UPPER_SNAKE (EQ, NEQ, GT) conforme enum textual.

---

## 4. Estilo de Código

- TypeScript estrito: "strict": true, noImplicitAny, exactOptionalPropertyTypes.
- Prefer interface para contratos externos; type para unions / utilitários.
- Discriminated unions com campo `kind` ou `type` consistente (usar `type` para Node; `kind` para sub-variedades internas).
- Evitar `any`. Usar generics ou unknown com narrowing.
- Retornos: se função pode falhar previsivelmente, retornar Result-like (futuro) ou lançar ValidationError só em validação agregada.
- Ordenação dentro de arquivo: imports → tipos → constantes → funções puras → builders → exports.
- Sem abreviações opacas (cfg, ctx ok; varX não).
- Comentários JSDoc em itens públicos.

---

## 5. Commits (Padrão Sugerido)

Formato: `<type>: <escopo opcional> - <resumo>`

Tipos: feat, fix, refactor, perf, docs, chore, test, build.

Ex: `feat(core): adicionar discriminated union para nós`.

Commits pequenos e atômicos. Sem bundling de refactor + feature.

---

## 6. Estrutura de Tarefas (Workflow do Agente)

Cada resposta do agente deve (quando implementando algo novo):
1. Contexto breve (o que está sendo feito / dependências).
2. Decisões e trade-offs.
3. Código em blocos (respeitar filepath).
4. Checklist de invariantes tocados.
5. Próximos passos ou perguntas.

Se a tarefa altera contratos anteriores, listar breaking changes explicitamente.

---

## 7. Tipagem (Guidelines)

- Não exportar tipos internos auxiliares que podem mudar (prefixar com _ se necessário).
- Public API agregada em index.ts (barrel) apenas para estáveis.
- Usar branded types para IDs se necessário futuramente: `type NodeId = string & { readonly __brand: "NodeId" };` (postergar até necessidade).

---

## 8. Validação (Design)

- Validadores modulares compõem um pipeline: cada um retorna issues[]; agregador monta ValidationResult.
- Issue: { level, code, message, context }.
- Níveis: error | warning | info.
- Códigos padronizados prefixados: NODE_, EDGE_, TRIGGER_, GRAPH_, CONDITION_.
- Não lançar exceção dentro de regras individuais (apenas agregador se solicitado).

---

## 9. Índices / Performance

- Função buildIndices(graph) retorna:
  - nodeMap
  - adjacency: outgoing/incoming
  - degrees: inDegree/outDegree
- Nunca persistir índices; são deriváveis.
- Atualizações incrementais futuras: TODO (planejar API updateIndices(prev, delta)).
- Caching condicional: só recomputar se hash estrutural mudar (hash futuro).

---

## 10. Conditions / Comparators

- Comparator table declarativa: { id, arity, validateOperands?, eval }.
- Operand resolvers resolvem para valor runtime (var/context/const/fn).
- Nenhum acesso direto a objetos globais dentro de evaluators.

---

## 11. Ações

- ActionNode.action.kind chave para registry.
- Action executor: (params, runtimeCtx) => Promise<ActionResult>.
- Retry config (maxAttempts, delayStrategy) — não implementar ainda, apenas tipar.

---

## 12. Parallel / Join Semantics

- ParallelNode.branches[] cada uma aponta para start de sub-fluxo.
- Join config define estratégia (waitAll | waitAny | count).
- Semântica de agregação futura: manter metadados de branch completion no runtime state.

---

## 13. Erros & Exceções

- Classes:
  - ValidationError (agrega issues).
  - ExecutionError (futuro).
- Mensagens curtas, adicionar data estruturada em propriedades (code, nodeId...).

---

## 14. Segurança

- Sanitizar nomes/descrições se forem exibidos.
- Impedir execução de automação com issues level=error.
- Nenhum dynamic eval; funções registradas vêm de objetos explicitamente injetados.

---

## 15. Versionamento / Releases

- SemVer (MAJOR: breaking types / contrato; MINOR: novas capacidades compatíveis; PATCH: correções).
- Gerar CHANGELOG manual ou script (futuro).
- Marcar itens experimentais com JsDoc @experimental.

---

## 16. Documentação

- Cada módulo expõe README breve (objetivo + exemplos).
- Gerar docs API (futuro) via TypeDoc.
- Exemplo mínimo end-to-end em /examples (definição → validação → (futuro) execução simulada).

---

## 17. Testes (Futuro)

- Camada: unit (tipos util, validators) / property (ciclos aleatórios) / snapshot (exemplos).
- Nome de arquivos: *.spec.ts.
- Factories puras para montar grafos pequenos.
- Testar casos limite: grafo vazio, 1 nó, branches divergentes, ciclo simples, ciclo profundo.

---

## 18. Qualidade / Linters

- Biome.js para formatação e lint consistente.
- CI (futuro): lint → build → test → typecheck.

---

## 19. Evolução de API

- Marcar campos que podem mudar com // @internal ou comentário TODO antes de estabilização.
- Antes de remover algo: deprecar (JsDoc @deprecated) por pelo menos um ciclo de release.

---

## 20. Processo de Extensão (Registry)

1. Definir metadados (id, displayName, category).
2. Schema (opcional) param validation.
3. Executor ou validator parcial.
4. Registrar via createRegistry / mergeRegistry.
5. Testar: registrar, validar exemplo, (futuro) executar.

---

## 21. Restrições do Agente

- Não introduzir libs externas sem justificativa.
- Não converter para classes grandes sem necessidade (preferir funções + tipos).
- Não esconder lógica crítica em abstrações genéricas prematuras.
- Evitar sobre-otimização antes de benchmarks.

---

## 22. Checklist Permanente (Ao Concluir Tarefa)

- [ ] Tipos coerentes
- [ ] Sem dependências circulares
- [ ] Nomeação consistente
- [ ] Comentários essenciais presentes
- [ ] Arquivos adicionados com filepath
- [ ] Nenhum TODO crítico esquecido sem menção
- [ ] Perguntas pendentes listadas (se existirem)

---

## 23. Glossário (Resumido)

- Automation: Conjunto completo (triggers + graph).
- Graph: Nós + arestas dirigidas (deve ser DAG).
- Node: Unidade de processamento.
- Edge: Conexão dirigida (condicional ou direta).
- Trigger: Evento que inicia instância de execução.
- Registry: Catálogo extensível de capacidades.
- Indices: Estruturas derivadas para acelerar lookup.
- Validation Issue: Item descritivo de problema ou aviso.

---

## 24. Futuro (Backlog Alto Nível)

- Otimização incremental de índices
- Serialização compacta
- Export gráfico para DOT
- Time-travel de execuções
- Plano de rollback / compensating actions
- Observabilidade com spans

---

## 25. Estilo de Resposta do Agente

- Objetivo e conciso, sem floreio.
- Usar bullet lists para decisões.
- Código sempre em blocos com filepath.
- Indicar se mudança é breaking.
- Se falta informação → perguntar antes de assumir.
