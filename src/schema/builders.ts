import type { Choice, Scene, Section, Story } from "./types.js";
import { type StoryValidationOptions, validateStory } from "./validation.js";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

type BuilderOptions<T, K extends keyof T> = Partial<Omit<T, K>>;

export function choice<TCustomEffectData = unknown>(
  text: string,
  nextSceneId: string,
  options?: BuilderOptions<Extract<Choice<TCustomEffectData>, { nextSceneId: string }>, "text" | "nextSceneId">,
): Extract<Choice<TCustomEffectData>, { nextSceneId: string }> {
  return {
    id: options?.id ?? slugify(text),
    text,
    nextSceneId,
    ...options,
  };
}

/** Apply effects without navigating or adding history. */
export function stayChoice<TCustomEffectData = unknown>(
  text: string,
  options?: BuilderOptions<Extract<Choice<TCustomEffectData>, { navigation: "stay" }>, "text" | "navigation" | "nextSceneId">,
): Extract<Choice<TCustomEffectData>, { navigation: "stay" }> {
  return { id: options?.id ?? slugify(text), text, ...options, navigation: "stay" };
}

export function scene<
  TContent = unknown,
  TPresentationData = unknown,
  TCustomEffectData = unknown,
>(
  id: string,
  text: string,
  choices: Choice<TCustomEffectData>[] = [],
  options?: BuilderOptions<
    Scene<TContent, TPresentationData, TCustomEffectData>,
    "id" | "text" | "choices"
  >,
): Scene<TContent, TPresentationData, TCustomEffectData> {
  return {
    id,
    text,
    choices,
    ...options,
  };
}

export function section<TPresentationData = unknown>(
  id: string,
  sceneIds: string[] = [],
  options?: BuilderOptions<Section<TPresentationData>, "id" | "sceneIds">,
): Section<TPresentationData> {
  return {
    id,
    ...(sceneIds.length > 0 ? { sceneIds } : {}),
    ...options,
  };
}

export function defineStory<
  TContent = unknown,
  TPresentationData = unknown,
  TCustomEffectData = unknown,
>(
  story: Story<TContent, TPresentationData, TCustomEffectData>,
): Story<TContent, TPresentationData, TCustomEffectData> {
  return story;
}

export function assertStory<
  TContent = unknown,
  TPresentationData = unknown,
  TCustomEffectData = unknown,
>(
  story: Story<TContent, TPresentationData, TCustomEffectData>,
  options?: StoryValidationOptions<TContent, TPresentationData>,
): Story<TContent, TPresentationData, TCustomEffectData> {
  validateStory(story, options);

  return story;
}

export function parseStory<
  TContent = unknown,
  TPresentationData = unknown,
  TCustomEffectData = unknown,
>(
  value: unknown,
  options?: StoryValidationOptions<TContent, TPresentationData>,
): Story<TContent, TPresentationData, TCustomEffectData> {
  if (!value || typeof value !== "object") {
    throw new Error("Story must be an object");
  }

  const story = value as Story<TContent, TPresentationData, TCustomEffectData>;

  if (!Array.isArray(story.scenes)) {
    throw new Error("Story must include a scenes array");
  }

  validateStory(story, options);

  return story;
}
