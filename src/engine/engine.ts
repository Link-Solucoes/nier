/** Engine principal: esqueleto com suporte a adapters assíncronos (per-node, per-flow, híbrido). */
import { buildIndices } from "../core/indices";
import type {
	ActionExecutionContext,
	ActionResult,
	Automation,
	ConditionNode,
	NodeId,
	Operand,
	RuntimeContextSpaces,
} from "../core/types";
import { resolveOperands } from "./operands";
import type {
	EngineRuntime,
	EngineSchedulerAdapter,
	ExecutionId,
	ExecutionState,
	NodeWorkInput,
	NodeWorkOutput,
} from "./types";

export interface CreateEngineParams {
	runtime: EngineRuntime;
	scheduler: EngineSchedulerAdapter;
}

export interface StartFlowParams {
	automation: Automation;
	executionId: ExecutionId;
	userData?: Record<string, unknown>;
}

export interface NodeJobHandlerParams {
	automation: Automation;
	executionId: ExecutionId;
	nodeId: NodeId;
	userData?: Record<string, unknown>;
}

export function createEngine({ runtime, scheduler }: CreateEngineParams) {
	return {
		/** Modo per-flow: agenda um job por execução completa. */
		async startFlow(params: StartFlowParams) {
			const { executionId } = params;
			runtime.onEvent?.({ type: "flowStarted", executionId });
			await scheduler.scheduleFlow({ executionId });
			return { executionId };
		},

		/** Modo per-node: agenda o primeiro nó imediatamente como job. */
		async startFlowPerNode(params: StartFlowParams) {
			const { automation, executionId } = params;
			runtime.onEvent?.({ type: "flowStarted", executionId });
			await scheduler.scheduleNode({
				executionId,
				nodeId: automation.rootNodeId,
			});
			return { executionId };
		},

		/** Deve ser chamado pelo consumidor quando um job de node for processado (fila externa ou inline). */
		async handleNodeJob({ automation, executionId, nodeId, userData }: NodeJobHandlerParams) {
			const indices = buildIndices(automation.graph);
			const now = new Date().toISOString();
			const loaded = await runtime.store?.load(executionId);
			const state: ExecutionState = loaded ?? {
				executionId,
				automationId: automation.meta.id,
				currentNodeId: nodeId,
				lastNodeId: undefined,
				startedAt: now,
				updatedAt: now,
				data: {},
			};
			const node = indices.nodeMap[nodeId];
			if (!node) throw new Error(`Node não encontrado: ${nodeId}`);
			const input: NodeWorkInput = {
				automation,
				indices,
				state,
				node,
				runtime,
				userContext: { data: userData || {} },
			};
			runtime.onEvent?.({ type: "nodeScheduled", executionId, nodeId });
			// Contexto de branch (paralelos)
			const nodeCtxRaw = (
				state.data as unknown as {
					__nodeCtx?: Record<string, { p: string; b: string }>;
				}
			).__nodeCtx;
			const ctxMap: Record<string, { p: string; b: string }> = nodeCtxRaw ? { ...nodeCtxRaw } : {};
			const incomingBranchCtx = ctxMap[nodeId];
			// Executa trabalho do nó
			let out: NodeWorkOutput;
			try {
				out = await handleNodeWork(input);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				// persist last error minimally in state.data
				(state.data as Record<string, unknown>).__lastError = {
					at: now,
					nodeId,
					message: msg,
				};
				await runtime.store?.save(state);
				runtime.onEvent?.({
					type: "nodeErrored",
					executionId,
					nodeId,
					error: { message: msg },
				});
				throw err;
			}
			// Atualiza estado base
			state.lastNodeId = nodeId;
			state.currentNodeId = out.next[0]?.nodeId;
			if (out.updatedState) Object.assign(state, out.updatedState);
			state.updatedAt = new Date().toISOString();
			// Atualiza e propaga branch context
			delete ctxMap[nodeId];
			// Se node atual é parallel, inicializa contexto para cada branch start
			if (node.type === "parallel") {
				for (const n of out.next) ctxMap[n.nodeId] = { p: node.id, b: n.nodeId };
			} else if (incomingBranchCtx) {
				// Propaga contexto do branch para próximos nós, a menos que já exista (ex: fan-out paralelo subsequente)
				for (const n of out.next) if (!ctxMap[n.nodeId]) ctxMap[n.nodeId] = incomingBranchCtx;
			}
			// Checa join: se não há próximos e o node pertence a um branch ativo, computa se deve acionar o join
			const extraNext: Array<{ nodeId: string; delayMs?: number }> = [];
			const controls = state.control?.parallel || {};
			if (out.next.length === 0 && incomingBranchCtx) {
				const pc = controls[incomingBranchCtx.p];
				if (pc && !pc.fired) {
					if (pc.branches && pc.branches[incomingBranchCtx.b] !== true) {
						pc.branches[incomingBranchCtx.b] = true;
						pc.completed += 1;
					}
					let shouldFire = false;
					if (pc.strategy === "waitAll") shouldFire = pc.completed >= pc.expected;
					else if (pc.strategy === "waitAny") shouldFire = pc.completed >= 1;
					else if (pc.strategy === "count") shouldFire = pc.completed >= (pc.count ?? pc.expected);
					if (shouldFire && pc.to && !pc.fired) {
						pc.fired = true;
						extraNext.push({ nodeId: pc.to });
					}
					state.control = {
						...(state.control || {}),
						parallel: { ...controls, [incomingBranchCtx.p]: pc },
					};
				}
			}
			// Persist ctx map
			(state.data as Record<string, unknown>).__nodeCtx = ctxMap as unknown as Record<string, unknown>;
			await runtime.store?.save(state);
			runtime.onEvent?.({
				type: "nodeCompleted",
				executionId,
				nodeId,
				result: out.result,
			});
			// Agendar próximos nós (incluindo join)
			const toSchedule = [...out.next, ...extraNext];
			for (const next of toSchedule) {
				await scheduler.scheduleNode({
					executionId,
					nodeId: next.nodeId,
					delayMs: next.delayMs,
				});
			}
			// Se nada a agendar, só completamos fluxo se não houver joins pendentes
			if (toSchedule.length === 0) {
				let hasPendingJoin = false;
				for (const k of Object.keys(controls)) {
					const pc = controls[k];
					if (!pc) continue;
					if (pc.fired) continue;
					if (pc.strategy === "waitAll" && pc.completed < pc.expected) hasPendingJoin = true;
					else if (pc.strategy === "waitAny" && pc.completed < 1) hasPendingJoin = true;
					else if (pc.strategy === "count" && pc.completed < (pc.count ?? pc.expected)) hasPendingJoin = true;
					if (hasPendingJoin) break;
				}
				if (!hasPendingJoin) runtime.onEvent?.({ type: "flowCompleted", executionId });
			}
			return out;
		},
	};
}
/**
 * Lida com o trabalho de um nó (stub). Futuramente: action exec, decision eval, parallel, wait.
 */
async function handleNodeWork(input: NodeWorkInput): Promise<NodeWorkOutput> {
	const { node, indices, runtime } = input;
	switch (node.type) {
		case "action": {
			const def = runtime.registry.actionKinds[node.action.kind];
			let result: ActionResult | undefined;
			if (def?.execute) {
				const ctx: ActionExecutionContext = {
					flow: {
						automationId: input.state.automationId,
						rootNodeId: input.automation.rootNodeId,
						triggerId: undefined,
						startedAt: input.state.startedAt,
					},
					exec: {
						currentNodeId: input.state.currentNodeId,
						lastNodeId: input.state.lastNodeId,
						nodeResults: input.state.exec?.nodeResults ?? {},
					},
					user: { data: input.userContext.data },
				};
				result = await def.execute(node.action.params ?? {}, ctx);
			}
			const nextIds = indices.outgoing[node.id] || [];
			const updatedState: Partial<ExecutionState> = {
				exec: {
					nodeResults: {
						...(input.state.exec?.nodeResults ?? {}),
						[node.id]: result,
					},
				},
			};
			return {
				result,
				next: nextIds.map((nid) => ({ nodeId: nid })),
				updatedState,
			};
		}
		case "decision": {
			// Avaliar condições via comparators; selecionar a primeira verdadeira; caso múltiplas, emitir evento.
			const matched: string[] = [];
			const execCtx: RuntimeContextSpaces = {
				flow: {
					automationId: input.state.automationId,
					rootNodeId: input.automation.rootNodeId,
					triggerId: undefined,
					startedAt: input.state.startedAt,
				},
				exec: {
					currentNodeId: input.state.currentNodeId,
					lastNodeId: input.state.lastNodeId,
					nodeResults: {},
				},
				user: { data: input.userContext.data },
			};

			const evalCondition = async (root?: ConditionNode): Promise<boolean> => {
				if (!root) return false;
				const evaluate = async (n: ConditionNode): Promise<boolean> => {
					if (n.type === "group") {
						const children = await Promise.all(n.children.map((c) => evaluate(c)));
						return n.op === "AND" ? children.every(Boolean) : children.some(Boolean);
					}
					// leaf condition
					const comp = runtime.registry.comparators[n.comparator];
					if (!comp) return false; // já validado, mas fail-safe
					const operands: Operand[] = n.right === undefined ? [n.left] : [n.left, n.right];
					const resolved = await resolveOperands(operands, execCtx, runtime.registry);
					return comp.eval(resolved as unknown as Operand[], execCtx);
				};
				return evaluate(root);
			};

			for (const b of node.branches) {
				const ok = await evalCondition(b.condition?.root);
				if (ok) matched.push(b.id);
			}
			if (matched.length > 1) {
				runtime.onEvent?.({
					type: "decisionMultiMatch",
					executionId: input.state.executionId,
					nodeId: node.id,
					matchedBranchIds: matched,
				});
			}
			if (matched.length >= 1) {
				const firstMatch = node.branches.find((b) => b.id === matched[0]);
				if (firstMatch) return { next: [{ nodeId: firstMatch.to }] };
			}
			if (node.defaultTo) return { next: [{ nodeId: node.defaultTo }] };
			return { next: [] };
		}
		case "parallel": {
			// MVP: fan-out to branch starts; join bookkeeping for future use
			const fanout = node.branches.map((b) => ({ nodeId: b.start }));
			// Initialize control if missing
			const ctrl = input.state.control ?? { parallel: {} };
			ctrl.parallel[node.id] = {
				expected: node.branches.length,
				completed: 0,
				to: node.to,
				strategy: node.join?.strategy ?? "waitAll",
				count: node.join?.count,
				branches: Object.fromEntries(node.branches.map((b) => [b.start, false])),
				fired: false,
			};
			return { next: fanout, updatedState: { control: ctrl } };
		}
		case "wait": {
			// Reagenda para o futuro conforme configuração
			if (!node.to) return { next: [] };
			let delayMs = 0;
			if (node.wait.kind === "duration") {
				delayMs = node.wait.durationMs ?? 0;
			} else if (node.wait.kind === "until") {
				const target = Date.parse(node.wait.untilTimestamp ?? "");
				if (!Number.isNaN(target)) {
					const now = Date.now();
					delayMs = Math.max(0, target - now);
				}
			}
			return { next: [{ nodeId: node.to, delayMs }] };
		}
		case "end":
			return { next: [] };
	}
}
