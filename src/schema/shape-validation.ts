import type { Condition, VariableValue } from "./types.js";

export function object(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
}

export function string(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a nonempty string`);
}

export function variableValue(value: unknown, field: string): asserts value is VariableValue {
  if (typeof value !== "string" && typeof value !== "boolean" &&
      !(typeof value === "number" && Number.isFinite(value))) {
    throw new Error(`${field} must be a string, boolean, or finite number`);
  }
}

function fields(value: Record<string, unknown>, allowed: string[], context: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${context}.${key} is not a supported field`);
  }
}

export function validateConditions(value: unknown, context: string): asserts value is Condition[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw new Error(`${context} must be an array`);
  for (const [index, condition] of value.entries()) {
    const field = `${context}[${index}]`;
    object(condition, field);
    fields(condition, ["variable", "operator", "value"], field);
    string(condition.variable, `${field}.variable`);
    if (!["===", "!==", ">", ">=", "<", "<="].includes(condition.operator as string)) {
      throw new Error(`${field}.operator is invalid`);
    }
    variableValue(condition.value, `${field}.value`);
  }
}

export function validateEffects(value: unknown, context: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw new Error(`${context} must be an array`);
  for (const [index, effect] of value.entries()) {
    const field = `${context}[${index}]`;
    object(effect, field);
    if ("type" in effect) {
      fields(effect, ["type", "data"], field);
      string(effect.type, `${field}.type`);
    } else {
      fields(effect, ["variable", "operation", "value"], field);
      string(effect.variable, `${field}.variable`);
      if (!["set", "increment", "decrement"].includes(effect.operation as string)) {
        throw new Error(`${field}.operation is invalid`);
      }
      variableValue(effect.value, `${field}.value`);
    }
  }
}
