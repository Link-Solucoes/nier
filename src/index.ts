// Barrel exports do core (Task 1)

export * from "./core/indices";
export * from "./core/types";
export * from "./core/validation";
export { listDefaultValidationRules } from "./core/validation";
export * from "./engine/engine";
export * from "./engine/scheduler";
export { InMemoryExecutionStore } from "./engine/store/in-memory";
export * from "./engine/types";
export * from "./registry/registry";
export {
	createActionKind,
	createComparator,
	createNodeKind,
	createOperandResolver,
	withValidationRules,
} from "./registry/registry";
export * from "./validation/rules/types";

/* Exemplo extensão custom
import { createComparator, mergeRegistry, coreRegistry, withValidationRules } from '.';

const startsWith = createComparator({ id: 'STARTS_WITH', arity: 2, eval: async ([a,b]) => String(a).startsWith(String(b)) });
const extended = mergeRegistry(coreRegistry, createRegistry({ comparators: [startsWith] }), { override: false });
const extendedWithRule = withValidationRules(extended, [ (ctx) => [] ]); // adiciona regra custom
}
*/

// Exemplo mínimo de Automation (comentado para evitar execução)
/*
import { Automation } from './core/types';

export const exampleAutomation: Automation = {
  meta: { id: 'auto_1', name: 'Exemplo Onboarding' },
  rootNodeId: 'startAction',
  graph: {
    nodes: [
      { id: 'startAction', type: 'action', action: { kind: 'send_email', params: { template: 'welcome' } } },
      { id: 'decidePlan', type: 'decision', branches: [
          { id: 'premium', to: 'premiumAction', condition: { root: { type: 'condition', comparator: 'EQ', left: { kind: 'var', path: 'user.plan' }, right: { kind: 'const', value: 'premium' } } } },
        ],
        defaultTo: 'standardAction'
      },
      { id: 'premiumAction', type: 'action', action: { kind: 'apply_premium_badge' } },
      { id: 'standardAction', type: 'action', action: { kind: 'apply_standard_tag' } },
      { id: 'end', type: 'end' }
    ],
    edges: [
      { id: 'e1', from: 'startAction', to: 'decidePlan' },
      { id: 'e2', from: 'premiumAction', to: 'end' },
      { id: 'e3', from: 'standardAction', to: 'end' }
    ]
  },
  triggers: [
    { id: 't1', event: 'user.created' },
    { id: 't2', event: 'user.reactivated' }
  ]
};
*/

/* Exemplo de validação DX:
import { validateAutomation, coreRegistry } from '.';
const result = validateAutomation({ automation: exampleAutomation, registry: coreRegistry });
if(!result.valid){
  console.error(result.issues.map(i=>`${i.level}:${i.code} - ${i.message}`));
}
*/
