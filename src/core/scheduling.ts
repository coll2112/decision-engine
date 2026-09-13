import { object, string, validateConditions } from "../schema/shape-validation.js";
import type { ScheduledContent, ScheduledContentDefinition } from "./types.js";

export const schedulingIdentity = (item: { sourceId: string; id: string }): string =>
  JSON.stringify([item.sourceId, item.id]);

export function timestamp(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new Error(`${field} must be a finite nonnegative timestamp within the safe number range`);
  }
}

function identity(value: unknown, seen: Set<string>): asserts value is Record<string, unknown> & { id: string; sourceId: string } {
  object(value, "Scheduled content");
  const context = `Content ${value.sourceId}/${value.id}`;
  string(value.id, `${context}.id`);
  string(value.sourceId, `${context}.sourceId`);
  const key = schedulingIdentity(value as { id: string; sourceId: string });
  if (seen.has(key)) throw new Error(`${context}.id has duplicate scheduling identity`);
  seen.add(key);
}

export function validateDefinitions(value: unknown): asserts value is ScheduledContentDefinition[] {
  if (!Array.isArray(value)) throw new Error("scheduledContent definitions must be an array");
  const seen = new Set<string>();
  for (const item of value) {
    identity(item, seen);
    const context = `Content ${item.sourceId}/${item.id}`;
    validateConditions(item.conditions, `${context}.conditions`);
    if (item.delivery === undefined) continue;
    object(item.delivery, `${context}.delivery`);
    const delivery = item.delivery;
    if (delivery.type !== "immediate" && delivery.type !== "delayed") throw new Error(`${context}.delivery.type is invalid`);
    const allowed = delivery.type === "immediate" ? ["type"] : ["type", "minDelaySeconds", "maxDelaySeconds", "notify"];
    for (const field of Object.keys(delivery)) {
      if (!allowed.includes(field)) throw new Error(`${context}.delivery.${field} is not a supported field`);
    }
    if (delivery.type === "immediate") continue;
    for (const field of ["minDelaySeconds", "maxDelaySeconds"] as const) {
      const delay = delivery[field];
      if (typeof delay !== "number" || !Number.isFinite(delay) || delay < 0 || delay > Number.MAX_SAFE_INTEGER / 1000) {
        throw new Error(`${context}.delivery.${field} must be a finite nonnegative delay within the safe number range`);
      }
    }
    if ((delivery.minDelaySeconds as number) > (delivery.maxDelaySeconds as number)) throw new Error(`${context}.delivery.maxDelaySeconds must be >= minDelaySeconds`);
    if (delivery.notify !== undefined && typeof delivery.notify !== "boolean") throw new Error(`${context}.delivery.notify must be boolean`);
  }
}

export function validateSchedules(value: unknown): asserts value is ScheduledContent[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw new Error("scheduledContent must be an array");
  const seen = new Set<string>();
  for (const item of value) {
    identity(item, seen);
    const context = `Content ${item.sourceId}/${item.id}`;
    timestamp(item.deliverAt, `${context}.deliverAt`);
    for (const field of ["delivered", "notify"] as const) {
      if (typeof item[field] !== "boolean") throw new Error(`${context}.${field} must be boolean`);
    }
  }
}
