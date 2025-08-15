// =========================
// IDs (futuros candidatos a branded types)
// =========================
export type AutomationId = string;
export type NodeId = string;
export type EdgeId = string; // Edge id agora obrigatório (observability / rastreio)
export type TriggerId = string;

// =========================
// Versionamento / metadata superficial
// =========================
export interface VersionInfo {
	major: number;
	minor: number;
	patch: number;
	label?: string; // ex: "beta"
}

export interface AutomationMeta {
	id: AutomationId;
	name: string;
	description?: string;
	version?: VersionInfo;
	createdAt?: string; // ISO
	updatedAt?: string; // ISO
}

// =========================
// Conditions / Operands / Comparators
// =========================
export type OperandKind = "const" | "var" | "context" | "fn";

export interface BaseOperand<K extends string = OperandKind> {
	kind: K;
	// value specifics depend on kind
}

export interface ConstOperand extends BaseOperand<"const"> {
	value: unknown;
}
export interface VarOperand extends BaseOperand<"var"> {
	path: string; // ex: "user.email"
}
export interface ContextOperand extends BaseOperand<"context"> {
	key: string; // chave direta no runtime context
}
export interface FnOperand extends BaseOperand<"fn"> {
	fnId: string; // id resolvido via registry de operand resolvers
	args?: unknown[];
}

export type Operand = ConstOperand | VarOperand | ContextOperand | FnOperand; // extensível via composição de tipos no futuro

export type ComparatorId = string; // ex: EQ, NEQ, GT ... (UPPER_SNAKE convention)

export interface ConditionLeaf {
	type: "condition";
	comparator: ComparatorId;
	left: Operand;
	right?: Operand; // alguns comparators podem ser unary
}

export interface ConditionGroup {
	type: "group";
	op: "AND" | "OR";
	children: ConditionNode[]; // recursivo
}

export type ConditionNode = ConditionLeaf | ConditionGroup;

// Wrapper para edges condicionais
export interface EdgeCondition {
	root: ConditionNode; // expressão principal
}

// =========================
// Nodes
// =========================
export type NodeType = "action" | "decision" | "parallel" | "wait" | "end";

interface BaseNode<T extends NodeType = NodeType, X = unknown> {
	id: NodeId;
	type: T;
	name?: string;
	notes?: string;
	// extensibility slot
	ext?: X; // dados específicos adicionais externos não interpretados pelo core
}

export interface ActionNode<P = Record<string, unknown>> extends BaseNode<"action"> {
	action: {
		kind: string; // actionKind id (registry)
		params?: P;
	};
	// Fan-out pode ser múltiplo via edges explícitas (condicionais ou não)
}

export interface DecisionBranch {
	id: string; // branch local id único dentro do node
	to: NodeId;
	condition?: EdgeCondition; // se ausente, é branch default candidato
}

export interface DecisionNode extends BaseNode<"decision"> {
	branches: DecisionBranch[]; // >=1; validado
	defaultTo?: NodeId; // opcional se nenhuma branch condicional satisfazer; validado para não duplicar
}

export interface ParallelBranch {
	id: string;
	start: NodeId; // nó inicial da subramificação
}

export interface ParallelJoinConfig {
	strategy: "waitAll" | "waitAny" | "count";
	count?: number; // usado quando strategy === count
}

export interface ParallelNode extends BaseNode<"parallel"> {
	branches: ParallelBranch[]; // >=2 validado
	join?: ParallelJoinConfig; // default waitAll
	to?: NodeId; // para seguir após join
}

export interface WaitNode extends BaseNode<"wait"> {
	wait: {
		kind: "duration" | "until"; // MVP
		durationMs?: number; // se kind=duration
		untilTimestamp?: string; // se kind=until (ISO)
	};
	to?: NodeId; // opcional
}

export interface EndNode extends BaseNode<"end"> {
	// sem campos adicionais
}

export type AnyNode = ActionNode | DecisionNode | ParallelNode | WaitNode | EndNode;

// =========================
// Edges
// =========================
export interface Edge {
	id: EdgeId; // obrigatório para rastreio/observability
	from: NodeId;
	to: NodeId;
	condition?: EdgeCondition; // usado tipicamente pós decision simplificada; DecisionNode.branches cobre caso principal
}

// =========================
// Triggers
// =========================
export interface Trigger {
	id: TriggerId;
	name?: string;
	event: string; // ex: "user.created"
	filter?: ConditionNode; // condição para acionar
	throttle?: {
		intervalMs: number;
		maxInInterval: number; // maxInInterval=0 => erro (regra de validação)
	};
}

// =========================
// Graph & Automation
// =========================
export interface Graph {
	nodes: AnyNode[];
	edges?: Edge[]; // edges extras além de estruturas nos nodes
}

export interface Automation {
	meta: AutomationMeta;
	rootNodeId: NodeId; // único start do fluxo, todos os triggers disparam este node
	graph: Graph;
	triggers: Trigger[]; // todos compartilham rootNodeId implicitamente
	// snapshot / hashing futuro
}

// =========================
// Registry related (tipos compartilhados de referência)
// =========================
// =========================
// Runtime Context (esqueleto - separação de espaços)
// =========================
export interface RuntimeFlowContext {
	automationId: AutomationId;
	rootNodeId: NodeId;
	triggerId?: TriggerId;
	startedAt: string; // ISO
}

export interface RuntimeExecutionContext {
	currentNodeId?: NodeId;
	lastNodeId?: NodeId;
	nodeResults: Record<NodeId, unknown>; // resultados de execução por node
}

export interface RuntimeUserContext {
	// dados injetados personalizados
	data: Record<string, unknown>;
}

export interface RuntimeContextSpaces {
	flow: RuntimeFlowContext;
	exec: RuntimeExecutionContext;
	user: RuntimeUserContext;
}

export interface ActionExecutionContext extends RuntimeContextSpaces {
	// extensões futuras (logger, metrics, etc.)
}

export interface ActionResult {
	status: "ok" | "error";
	data?: unknown;
	error?: string;
}

/** Executor de ação. Implementado por ActionKindDefinition no registry. */
export type ActionExecutor<P = Record<string, unknown>> = (
	params: P,
	ctx: ActionExecutionContext,
) => Promise<ActionResult>;

// Comparator shape (referência) - implementação real no registry
export type ComparatorEvalFn = (operands: Operand[], runtime: RuntimeContextSpaces) => Promise<boolean>;

export interface ComparatorDefinition {
	id: ComparatorId;
	arity: number; // 1 ou 2 inicialmente
	eval: ComparatorEvalFn;
	// optional type hints
	// TODO: adicionar validação de tipos de operandos
}

// =========================
// Utility Types
// =========================
export type NodeByType<T extends NodeType> = Extract<AnyNode, { type: T }>;
