import type { Choice, Scene, Section, Story } from "./types.js";
import { validateStory } from "./validation.js";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

type BuilderOptions<T, K extends keyof T> = Partial<Omit<T, K>>;

export function choice(
  text: string,
  nextSceneId: string,
  options?: BuilderOptions<Choice, "text" | "nextSceneId">,
): Choice {
  return {
    id: options?.id ?? slugify(text),
    text,
    nextSceneId,
    ...options,
  };
}

export function scene(
  id: string,
  text: string,
  choices: Choice[] = [],
  options?: BuilderOptions<Scene, "id" | "text" | "choices">,
): Scene {
  return {
    id,
    text,
    choices,
    ...options,
  };
}

export function section(
  id: string,
  sceneIds: string[] = [],
  options?: BuilderOptions<Section, "id" | "sceneIds">,
): Section {
  return {
    id,
    ...(sceneIds.length > 0 ? { sceneIds } : {}),
    ...options,
  };
}

export function defineStory(story: Story): Story {
  return story;
}

export function assertStory(story: Story): Story {
  validateStory(story);

  return story;
}

export function parseStory(value: unknown): Story {
  if (!value || typeof value !== "object") {
    throw new Error("Story must be an object");
  }

  const story = value as Story;

  if (!Array.isArray(story.scenes)) {
    throw new Error("Story must include a scenes array");
  }

  validateStory(story);

  return story;
}
