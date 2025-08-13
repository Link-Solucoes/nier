import type { ExecutionState, ExecutionStore } from "../types";

/** Simple in-memory store for development and tests. Not for production use. */
export class InMemoryExecutionStore implements ExecutionStore {
	private map = new Map<string, ExecutionState>();

	async load(executionId: string): Promise<ExecutionState | undefined> {
		return this.map.get(executionId);
	}

	async save(state: ExecutionState): Promise<void> {
		this.map.set(state.executionId, { ...state });
	}
}
