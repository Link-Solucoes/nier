/**
 * Tipos da engine: execução síncrona/assíncrona via adapters.
 * Mantém core sem dependências de fila.
 */

import type { Indices } from "../core/indices";
import type {
	ActionResult,
	AnyNode,
	Automation,
	AutomationId,
	ComparatorDefinition,
	NodeId,
	Operand,
	RuntimeContextSpaces,
} from "../core/types";
import type { Registry } from "../registry/registry";

export type ExecutionId = string;
export type NodeExecutionId = string;

export interface ExecutionState {
	executionId: ExecutionId;
	automationId: AutomationId;
	currentNodeId?: NodeId;
	lastNodeId?: NodeId;
	startedAt: string; // ISO
	updatedAt: string; // ISO
	data: Record<string, unknown>; // estado custom persistível
	control?: ExecutionControl; // controle consolidado (paralelos/joins), opcional
	/** Resultados por nó e metadados de execução */
	exec?: {
		nodeResults: Record<NodeId, unknown>;
	};
}

export interface EngineOptions {
	// Estratégia de scheduling: per-flow, per-node ou híbrido (decidido pelo adapter)
	mode?: "per-flow" | "per-node" | "hybrid";
}

// Eventos básicos (observabilidade futura)
export type EngineEvent =
	| { type: "flowStarted"; executionId: ExecutionId }
	| { type: "nodeScheduled"; executionId: ExecutionId; nodeId: NodeId }
	| {
			type: "nodeCompleted";
			executionId: ExecutionId;
			nodeId: NodeId;
			result?: ActionResult;
	  }
	| { type: "flowCompleted"; executionId: ExecutionId }
	| {
			type: "decisionMultiMatch";
			executionId: ExecutionId;
			nodeId: NodeId;
			matchedBranchIds: string[];
	  }
	| {
			type: "nodeErrored";
			executionId: ExecutionId;
			nodeId: NodeId;
			error: { code?: string; message: string };
	  };

export type EngineEventHandler = (event: EngineEvent) => void | Promise<void>;

// Adapter de agendamento (fila ou inline)
export interface ScheduleJobPayload {
	executionId: ExecutionId;
	nodeId: NodeId;
	delayMs?: number; // opcional: para Wait e backoff
}

export interface FlowJobPayload {
	executionId: ExecutionId;
	delayMs?: number;
}

export interface EngineSchedulerAdapter {
	// Agendamento por node: cada node vira um job
	scheduleNode(payload: ScheduleJobPayload): Promise<void>;
	// Agendamento por fluxo: a execução completa é um job
	scheduleFlow(payload: FlowJobPayload): Promise<void>;
}

export interface EngineRuntime {
	registry: Registry;
	options?: EngineOptions;
	onEvent?: EngineEventHandler;
	store?: ExecutionStore; // persistência plugável
}

export interface ConditionEvaluator {
	eval(def: ComparatorDefinition, operands: Operand[], runtime: RuntimeContextSpaces): Promise<boolean>;
}

export interface NodeWorkInput {
	automation: Automation;
	indices: Indices;
	state: ExecutionState;
	node: AnyNode;
	runtime: EngineRuntime;
	userContext: RuntimeContextSpaces["user"]; // dados injetados
}

export interface NodeWorkOutput {
	result?: ActionResult; // para action nodes
	next: Array<{ nodeId: NodeId; delayMs?: number }>; // fan-out (0..n) com delay opcional
	updatedState?: Partial<ExecutionState>;
}

// Persistência plugável
export interface ExecutionStore {
	load(executionId: ExecutionId): Promise<ExecutionState | undefined>;
	save(state: ExecutionState): Promise<void>;
}

// Controle consolidado por execução (paralelos, joins, etc.)
export interface ParallelJoinControl {
	expected: number;
	completed: number;
	to?: NodeId; // próximo nó após join
	strategy: "waitAll" | "waitAny" | "count";
	count?: number;
	branches?: Record<NodeId, boolean>; // track completion per start node (MVP)
	fired?: boolean; // whether join continuation already scheduled
}

export interface ExecutionControl {
	parallel: Record<string, ParallelJoinControl>; // key = parallelNodeId
}

// Estender ExecutionState com controle consolidado
declare module "./types" {}

// Executor de ação (registry) — contrato efetivo
// ActionExecutor está definido em core/types para evitar duplicatas de export.
