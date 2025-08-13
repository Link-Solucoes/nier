/** Scheduler adapters: inline e contrato para fila externa. */
import type { EngineSchedulerAdapter, FlowJobPayload, ScheduleJobPayload } from "./types";

/** Adapter inline que executa imediatamente (útil para testes/dev). */
export class InlineSchedulerAdapter implements EngineSchedulerAdapter {
	constructor(
		private handlers: {
			onNodeJob?: (payload: ScheduleJobPayload) => Promise<void>;
			onFlowJob?: (payload: FlowJobPayload) => Promise<void>;
		},
	) {}
	async scheduleNode(payload: ScheduleJobPayload): Promise<void> {
		if (!this.handlers.onNodeJob) throw new Error("onNodeJob não configurado");
		if (payload.delayMs && payload.delayMs > 0) {
			await new Promise((r) => setTimeout(r, payload.delayMs));
		}
		await this.handlers.onNodeJob(payload);
	}
	async scheduleFlow(payload: FlowJobPayload): Promise<void> {
		if (!this.handlers.onFlowJob) throw new Error("onFlowJob não configurado");
		if (payload.delayMs && payload.delayMs > 0) {
			await new Promise((r) => setTimeout(r, payload.delayMs));
		}
		await this.handlers.onFlowJob(payload);
	}
}

/** Contrato para adapter de fila (ex: BullMQ) — implementado pelo usuário. */
export interface QueueLikeAdapter extends EngineSchedulerAdapter {
	// Pode aceitar opções específicas da fila na construção (não definidas aqui para manter core desacoplado)
}
