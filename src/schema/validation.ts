import type { Story } from "./types.js";
import { object, string, validateConditions, validateEffects } from "./shape-validation.js";

export type StoryValidationOptions<
  TContent = unknown,
  TPresentationData = unknown,
> = {
  validateSceneContent?: (content: TContent, sceneId: string) => void;
  validatePresentationData?: (
    data: TPresentationData,
    owner: { kind: "scene" | "section"; id: string },
  ) => void;
};

export function validateStory<
  TContent = unknown,
  TPresentationData = unknown,
  TCustomEffectData = unknown,
>(
  story: Story<TContent, TPresentationData, TCustomEffectData>,
  options: StoryValidationOptions<TContent, TPresentationData> = {},
): void {
  object(story, "Story");
  string(story.id, "Story.id");
  if (typeof story.title !== "string") throw new Error("Story.title must be a string");
  string(story.startSceneId, "Story.startSceneId");
  if (!Array.isArray(story.scenes)) throw new Error("Story.scenes must be an array");
  if (story.sections !== undefined && !Array.isArray(story.sections)) throw new Error("Story.sections must be an array");
  const sceneIds = new Set<string>();
  const sectionIds = new Set<string>();
  const sectionsById = new Map<
    string,
    NonNullable<Story<TContent, TPresentationData>["sections"]>[number]
  >();
  const assignedSceneIds = new Set<string>();

  for (const scene of story.scenes) {
    object(scene, "Scene");
    string(scene.id, "Scene.id");
    if (typeof scene.text !== "string") throw new Error(`Scene ${scene.id}.text must be a string`);
    if (!Array.isArray(scene.choices)) throw new Error(`Scene ${scene.id}.choices must be an array`);
    const choiceIds = new Set<string>();
    for (const choice of scene.choices) {
      object(choice, `Scene ${scene.id} choice`);
      const context = `Scene ${scene.id} choice ${choice.id}`;
      string(choice.id, `${context}.id`);
      if (choiceIds.has(choice.id)) throw new Error(`${context}.id is duplicate`);
      choiceIds.add(choice.id);
      if (typeof choice.text !== "string") throw new Error(`${context}.text must be a string`);
      string(choice.nextSceneId, `${context}.nextSceneId`);
      validateConditions(choice.conditions, `${context}.conditions`);
      validateEffects(choice.effects, `${context}.effects`);
    }
    if (sceneIds.has(scene.id)) {
      throw new Error(`Duplicate scene id found: ${scene.id}`);
    }

    sceneIds.add(scene.id);

    if ("content" in scene && options.validateSceneContent) {
      options.validateSceneContent(scene.content as TContent, scene.id);
    }

    if (scene.presentation && "data" in scene.presentation) {
      options.validatePresentationData?.(scene.presentation.data as TPresentationData, {
        kind: "scene",
        id: scene.id,
      });
    }
  }

  if (!sceneIds.has(story.startSceneId)) {
    throw new Error(`Start scene ${story.startSceneId} does not exist`);
  }

  for (const section of story.sections ?? []) {
    object(section, "Section");
    string(section.id, "Section.id");
    if (section.parentSectionId !== undefined) string(section.parentSectionId, `Section ${section.id}.parentSectionId`);
    if (section.sceneIds !== undefined && !Array.isArray(section.sceneIds)) throw new Error(`Section ${section.id}.sceneIds must be an array`);
    if (sectionIds.has(section.id)) {
      throw new Error(`Duplicate section id found: ${section.id}`);
    }

    sectionIds.add(section.id);
    sectionsById.set(section.id, section);

    if (section.presentation && "data" in section.presentation) {
      options.validatePresentationData?.(
        section.presentation.data as TPresentationData,
        {
          kind: "section",
          id: section.id,
        },
      );
    }

    const sectionSceneIds = new Set<string>();

    for (const sceneId of section.sceneIds ?? []) {
      if (sectionSceneIds.has(sceneId)) {
        throw new Error(
          `Section ${section.id} contains duplicate scene ${sceneId}`,
        );
      }

      sectionSceneIds.add(sceneId);

      if (!sceneIds.has(sceneId)) {
        throw new Error(
          `Section ${section.id} points to missing scene ${sceneId}`,
        );
      }

      if (assignedSceneIds.has(sceneId)) {
        throw new Error(
          `Scene ${sceneId} is assigned to more than one section`,
        );
      }

      assignedSceneIds.add(sceneId);
    }
  }

  for (const section of story.sections ?? []) {
    if (!section.parentSectionId) continue;

    if (section.parentSectionId === section.id) {
      throw new Error(`Section ${section.id} cannot parent itself`);
    }

    if (!sectionIds.has(section.parentSectionId)) {
      throw new Error(
        `Section ${section.id} points to missing parent section ${section.parentSectionId}`,
      );
    }
  }

  for (const section of story.sections ?? []) {
    const visited = new Set<string>();
    let current = section;

    while (current.parentSectionId) {
      if (visited.has(current.id)) {
        throw new Error(`Section ${section.id} has a circular parent chain`);
      }

      visited.add(current.id);
      const parent = sectionsById.get(current.parentSectionId);

      if (!parent) break;

      current = parent;
    }
  }

  for (const scene of story.scenes) {
    for (const choice of scene.choices) {
      if (!sceneIds.has(choice.nextSceneId)) {
        throw new Error(
          `Scene ${scene.id} has choice ${choice.id} pointing to missing scene ${choice.nextSceneId} (nextSceneId)`,
        );
      }
    }
  }
}
