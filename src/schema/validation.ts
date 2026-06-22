import type { Story } from "./types.js";

export function validateStory(story: Story): void {
  const sceneIds = new Set<string>();
  const sectionIds = new Set<string>();
  const sectionsById = new Map<string, NonNullable<Story["sections"]>[number]>();
  const assignedSceneIds = new Set<string>();

  for (const scene of story.scenes) {
    if (sceneIds.has(scene.id)) {
      throw new Error(`Duplicate scene id found: ${scene.id}`);
    }

    sceneIds.add(scene.id);
  }

  if (!sceneIds.has(story.startSceneId)) {
    throw new Error(`Start scene ${story.startSceneId} does not exist`);
  }

  for (const section of story.sections ?? []) {
    if (sectionIds.has(section.id)) {
      throw new Error(`Duplicate section id found: ${section.id}`);
    }

    sectionIds.add(section.id);
    sectionsById.set(section.id, section);

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
          `Scene ${scene.id} has choice ${choice.id} pointing to missing scene ${choice.nextSceneId}`,
        );
      }
    }
  }
}
