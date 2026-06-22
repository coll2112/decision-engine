import {
  type Story,
  type Scene,
  type Choice,
  type Effect,
  type ScenePresentation,
  type Section,
  type Asset,
  validateStory,
} from "../schema/index.js";
import type { GameState, SceneView } from "./types.js";

function mergePresentation(
  sectionPresentations: ScenePresentation[],
  scenePresentation?: ScenePresentation,
): ScenePresentation | undefined {
  const presentations = [...sectionPresentations, scenePresentation].filter(
    (presentation): presentation is ScenePresentation => Boolean(presentation),
  );

  if (presentations.length === 0) return undefined;

  const elements = presentations.flatMap(
    (presentation) => presentation.elements ?? [],
  );
  const audio = presentations.flatMap((presentation) => presentation.audio ?? []);
  const background = [...presentations]
    .reverse()
    .find((presentation) => presentation.background)?.background;

  return {
    ...(background ? { background } : {}),
    ...(elements.length > 0 ? { elements } : {}),
    ...(audio.length > 0 ? { audio } : {}),
  };
}

function mergeAssets(sections: Section[]): Record<string, Asset> {
  return sections.reduce<Record<string, Asset>>(
    (assets, section) => ({
      ...assets,
      ...(section.assets ?? {}),
    }),
    {},
  );
}

function cloneState(state: GameState): GameState {
  return {
    currentSceneId: state.currentSceneId,
    history: [...state.history],
    variables: { ...state.variables },
  };
}

export class DecisionEngine {
  private readonly sceneMap: Map<string, Scene>;
  private readonly sectionMap: Map<string, Section>;
  private readonly sceneSectionMap: Map<string, Section>;

  private story: Story;
  private state: GameState;

  constructor(story: Story) {
    validateStory(story);

    this.story = story;

    this.sceneMap = new Map(story.scenes.map((scene) => [scene.id, scene]));
    this.sectionMap = new Map(
      (story.sections ?? []).map((section) => [section.id, section]),
    );
    this.sceneSectionMap = new Map(
      (story.sections ?? []).flatMap((section) =>
        (section.sceneIds ?? []).map((sceneId) => [sceneId, section] as const),
      ),
    );

    this.state = {
      currentSceneId: story.startSceneId,
      history: [],
      variables: {},
    };
  }

  public getCurrentScene(): Scene {
    const scene = this.getScene(this.state.currentSceneId);

    return {
      ...scene,
      choices: this.getAvailableChoices(scene.choices),
    };
  }

  public getCurrentSceneView(): SceneView {
    const scene = this.getCurrentScene();
    const section = this.sceneSectionMap.get(scene.id);
    const sections = section ? this.getSectionChain(section) : [];

    return {
      scene,
      section,
      sections,
      assets: mergeAssets(sections),
      presentation: mergePresentation(
        sections.flatMap((section) =>
          section.presentation ? [section.presentation] : [],
        ),
        scene.presentation,
      ),
    };
  }

  public getSection(id: string): Section {
    const section = this.sectionMap.get(id);

    if (!section) {
      throw new Error(`Section not found: ${id}`);
    }

    return section;
  }

  public choose(choiceId: string): Scene {
    const currentScene = this.getCurrentScene();

    const choice = currentScene.choices.find((choice) => choice.id === choiceId);

    if (!choice) {
      throw new Error(`Choice not found: ${choiceId}`);
    }

    this.applyEffects(choice.effects ?? []);

    this.state.history.push(currentScene.id);
    this.state.currentSceneId = choice.nextSceneId;

    return this.getCurrentScene();
  }

  public chooseView(choiceId: string): SceneView {
    this.choose(choiceId);

    return this.getCurrentSceneView();
  }

  public getState(): GameState {
    return cloneState(this.state);
  }

  public loadState(state: GameState): void {
    this.getScene(state.currentSceneId);

    this.state = cloneState(state);
  }

  public loadStateView(state: GameState): SceneView {
    this.loadState(state);

    return this.getCurrentSceneView();
  }

  public restart(): Scene {
    this.state = {
      currentSceneId: this.story.startSceneId,
      history: [],
      variables: {},
    };

    return this.getCurrentScene();
  }

  public restartView(): SceneView {
    this.restart();

    return this.getCurrentSceneView();
  }

  public goToScene(sceneId: string): Scene {
    this.getScene(sceneId);
    this.state.history.push(this.state.currentSceneId);
    this.state.currentSceneId = sceneId;

    return this.getCurrentScene();
  }

  public goToSceneView(sceneId: string): SceneView {
    this.goToScene(sceneId);

    return this.getCurrentSceneView();
  }

  private getAvailableChoices(choices: Choice[]): Choice[] {
    return choices.filter((choice) => {
      if (!choice.conditions?.length) return true;

      return choice.conditions.every((condition) => {
        const currentValue = this.state.variables[condition.variable];

        switch (condition.operator) {
          case "===":
            return currentValue === condition.value;
          case "!==":
            return currentValue !== condition.value;
          case ">":
            return Number(currentValue) > Number(condition.value);
          case ">=":
            return Number(currentValue) >= Number(condition.value);
          case "<":
            return Number(currentValue) < Number(condition.value);
          case "<=":
            return Number(currentValue) <= Number(condition.value);
          default:
            return false;
        }
      });
    });
  }

  private applyEffects(effects: Effect[]): void {
    effects.forEach((effect) => {
      const currentValue = this.state.variables[effect.variable];

      switch (effect.operation) {
        case "set":
          this.state.variables[effect.variable] = effect.value;
          break;
        case "increment":
          this.state.variables[effect.variable] =
            Number(currentValue ?? 0) + Number(effect.value);
          break;
        case "decrement":
          this.state.variables[effect.variable] =
            Number(currentValue ?? 0) - Number(effect.value);
          break;
      }
    });
  }

  private getScene(id: string): Scene {
    const scene = this.sceneMap.get(id);

    if (!scene) {
      throw new Error(`Scene not found: ${id}`);
    }

    return scene;
  }

  private getSectionChain(section: Section): Section[] {
    const sections: Section[] = [];
    let current: Section | undefined = section;

    while (current) {
      sections.unshift(current);
      current = current.parentSectionId
        ? this.sectionMap.get(current.parentSectionId)
        : undefined;
    }

    return sections;
  }
}
