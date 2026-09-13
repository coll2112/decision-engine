import type { Condition, VariableValue } from "../schema/index.js";

/** All conditions must match. Equality is strict; ordering uses Number coercion. */
export function evaluateConditions(
  conditions: readonly Condition[] | undefined,
  variables: Readonly<Record<string, VariableValue>>,
): boolean {
  return (conditions ?? []).every((condition) => {
    const current = variables[condition.variable];
    switch (condition.operator) {
      case "===": return current === condition.value;
      case "!==": return current !== condition.value;
      case ">": return Number(current) > Number(condition.value);
      case ">=": return Number(current) >= Number(condition.value);
      case "<": return Number(current) < Number(condition.value);
      case "<=": return Number(current) <= Number(condition.value);
      default: return false;
    }
  });
}
