import type { Automation, ConditionNode, RuntimeContextSpaces } from "../core/types";
import { evaluateConditionTree } from "./conditions";
import type { EngineRuntime, ExecutionId } from "./types";

/**
 * Metadata de execução de um trigger (config privada do usuário).
 */
export interface TriggerExecConfig<Evt = unknown> {
	/** Deriva o executionId para a instância a partir do evento. */
	makeExecutionId: (evt: Evt) => ExecutionId;
	/** Escolhe qual automation iniciar (pode ser dinâmico). */
	selectAutomation: (evt: Evt) => Automation;
	/** (Opcional) Monta user.data a partir do evento. */
	mapUserData?: (evt: Evt) => Record<string, unknown>;
	/** (Opcional) Modo de start (per-node ou per-flow). Default: per-node. */
	mode?: "per-node" | "per-flow";
}

export interface CreateTriggerHelperInput<Evt = unknown> {
	/** ID único deste trigger (coincide com Trigger.id do modelo, se desejar). */
	id: string;
	/** Nome do evento que este helper trata (livre, para DX). */
	event: string;
	/** Filtro opcional compatível com ConditionNode. */
	filter?: ConditionNode;
	/** Configuração de execução (como criar executionId, etc.). */
	exec: TriggerExecConfig<Evt>;
}

export interface TriggerHandler<Evt = unknown> {
	/** Nome do evento que esse handler espera. */
	event: string;
	/** Função que processa o evento e inicia o fluxo se o filtro passar. */
	handle: (evt: Evt, runtime: EngineRuntime) => Promise<{ started: boolean; executionId?: ExecutionId }>;
}

/**
 * Cria um helper de trigger com tipagem forte sobre o payload de evento.
 * Responsabilidade de agendamento/escuta do evento é do usuário (ex.: NestJS listener, fila, etc.).
 */
export function createTriggerHelper<Evt = unknown>(input: CreateTriggerHelperInput<Evt>): TriggerHandler<Evt> {
	const { id, event, filter, exec } = input;
	return {
		event,
		async handle(evt, runtime) {
			const automation = exec.selectAutomation(evt);
			// Monta contexto mínimo para avaliar filtro
			const runtimeCtx: RuntimeContextSpaces = {
				flow: {
					automationId: automation.meta.id,
					rootNodeId: automation.rootNodeId,
					triggerId: id,
					startedAt: new Date().toISOString(),
				},
				exec: {
					currentNodeId: undefined,
					lastNodeId: undefined,
					nodeResults: {},
				},
				user: { data: exec.mapUserData ? exec.mapUserData(evt) : {} },
			};
			const ok = await evaluateConditionTree(filter, runtimeCtx, runtime.registry);
			if (!ok) return { started: false };

			const executionId = exec.makeExecutionId(evt);
			if (exec.mode === "per-flow") {
				// DX: o consumidor pode agendar via scheduler externo; aqui apenas registra o início.
				await runtime.onEvent?.({ type: "flowStarted", executionId });
				return { started: true, executionId };
			}
			// Default: per-node — consumidor deve chamar engine.startFlowPerNode externamente
			return { started: true, executionId };
		},
	};
}
