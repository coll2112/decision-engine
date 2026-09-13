import { object } from "./shape-validation.js";

type Validator = (value: unknown, field: string) => void;

function primitive(type: "string" | "number" | "boolean"): Validator {
  return (value, field) => {
    if (typeof value !== type || (type === "number" && !Number.isFinite(value))) {
      throw new Error(`${field} must be a ${type}`);
    }
  };
}
const text = primitive("string");
const number = primitive("number");
const boolean = primitive("boolean");

function optionalFields(value: Record<string, unknown>, validators: Record<string, Validator>, field: string): void {
  for (const [key, validate] of Object.entries(validators)) {
    if (value[key] !== undefined) validate(value[key], `${field}.${key}`);
  }
}

function array(validate: Validator): Validator {
  return (value, field) => {
    if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
    for (const [index, item] of value.entries()) validate(item, `${field}[${index}]`);
  };
}

function asset(value: unknown, field: string): void {
  object(value, field);
  text(value.src, `${field}.src`);
}

export function validateAssets(value: unknown, field: string): void {
  object(value, field);
  for (const [key, item] of Object.entries(value)) asset(item, `${field}.${key}`);
}

function element(value: unknown, field: string): void {
  object(value, field);
  text(value.id, `${field}.id`);
  optionalFields(value, { positionX: number, positionY: number, width: number, height: number }, field);
  switch (value.type) {
    case "image": asset(value.asset, `${field}.asset`); break;
    case "hotspot": optionalFields(value, { props: object }, field); break;
    case "light": optionalFields(value, { color: text, intensity: number, flicker: boolean }, field); break;
    default: throw new Error(`${field}.type must be image, hotspot, or light`);
  }
}

function track(value: unknown, field: string): void {
  object(value, field);
  text(value.id, `${field}.id`);
  text(value.src, `${field}.src`);
  optionalFields(value, { volume: number, loop: boolean }, field);
}

function cue(value: unknown, field: string): void {
  object(value, field);
  text(value.id, `${field}.id`);
  text(value.src, `${field}.src`);
  optionalFields(value, { volume: number, delayMs: number }, field);
}

function audio(value: unknown, field: string): void {
  object(value, field);
  optionalFields(value, { music: track, ambience: array(track), sfx: array(cue) }, field);
}

/** Validate owned presentation hints while leaving generic data untouched. */
export function validatePresentation(value: unknown, field: string): void {
  object(value, field);
  optionalFields(value, { type: text, background: asset, elements: array(element), audio: array(audio) }, field);
}
