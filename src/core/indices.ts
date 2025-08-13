/**
 * Índices derivados do grafo (Task 1): adjacency, graus, nodeMap.
 * Implementação simples O(N+E). Sem cache incremental ainda.
 */
import type { AnyNode, Graph, NodeId } from "./types";

export interface AdjacencyLists {
	outgoing: Record<NodeId, NodeId[]>;
	incoming: Record<NodeId, NodeId[]>;
}

export interface DegreeIndex {
	inDegree: Record<NodeId, number>;
	outDegree: Record<NodeId, number>;
}

export interface NodeMapIndex {
	nodeMap: Record<NodeId, AnyNode>;
}

export interface Indices extends AdjacencyLists, DegreeIndex, NodeMapIndex {}

/**
 * Constrói índices derivados básicos.
 * Não realiza validações semânticas; assume lista de nós possivelmente inválida.
 */
export function buildIndices(graph: Graph): Indices {
	const outgoing: Record<NodeId, NodeId[]> = {};
	const incoming: Record<NodeId, NodeId[]> = {};
	const inDegree: Record<NodeId, number> = {};
	const outDegree: Record<NodeId, number> = {};
	const nodeMap: Record<NodeId, AnyNode> = {};

	for (const n of graph.nodes) {
		nodeMap[n.id] = n;
		outgoing[n.id] = [];
		incoming[n.id] = [];
		inDegree[n.id] = 0;
		outDegree[n.id] = 0;
	}

	const pushEdge = (from: NodeId, to: NodeId) => {
		if (!outgoing[from]) outgoing[from] = [];
		if (!incoming[to]) incoming[to] = [];
		outgoing[from].push(to);
		incoming[to].push(from);
		outDegree[from] = (outDegree[from] || 0) + 1;
		inDegree[to] = (inDegree[to] || 0) + 1;
	};

	// Edges explícitas
	if (graph.edges) {
		for (const e of graph.edges) {
			pushEdge(e.from, e.to);
		}
	}

	// Edges implícitas por tipo de node (Decision / Parallel / Wait etc.)
	for (const n of graph.nodes) {
		switch (n.type) {
			case "decision":
				for (const b of n.branches) {
					pushEdge(n.id, b.to);
				}
				if (n.defaultTo) pushEdge(n.id, n.defaultTo);
				break;
			case "parallel":
				for (const b of n.branches) {
					pushEdge(n.id, b.start);
				}
				if (n.to) pushEdge(n.id, n.to);
				break;
			case "wait":
				if (n.to) pushEdge(n.id, n.to);
				break;
			case "action":
				// action fan-out via explicit edges only (enforced in validation)
				break;
			case "end":
				break;
		}
	}

	return { outgoing, incoming, inDegree, outDegree, nodeMap };
}
