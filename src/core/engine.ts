import {
  type Story,
  type Choice,
  type CustomEffect,
  type Effect,
  type Scene,
  type ScenePresentation,
  type Section,
  type Asset,
  validateStory,
} from "../schema/index.js";
import {
  type CustomEffectHandler,
  type DecisionEngineOptions,
  type EffectHandlerMap,
  EffectHandlers,
  type GameState,
  type SceneView,
} from "./types.js";

function mergePresentation<TPresentationData>(
  sectionPresentations: ScenePresentation<TPresentationData>[],
  scenePresentation?: ScenePresentation<TPresentationData>,
): ScenePresentation<TPresentationData> | undefined {
  const presentations = [...sectionPresentations, scenePresentation].filter(
    (presentation): presentation is ScenePresentation<TPresentationData> =>
      Boolean(presentation),
  );

  if (presentations.length === 0) return undefined;

  const elements = presentations.flatMap(
    (presentation) => presentation.elements ?? [],
  );
  const audio = presentations.flatMap((presentation) => presentation.audio ?? []);
  const background = [...presentations]
    .reverse()
    .find((presentation) => presentation.background)?.background;

  const lastTypedPresentation = [...presentations]
    .reverse()
    .find(
      (presentation) =>
        presentation.type !== undefined || presentation.data !== undefined,
    );

  return {
    ...(lastTypedPresentation?.type !== undefined
      ? { type: lastTypedPresentation.type }
      : {}),
    ...(lastTypedPresentation?.data !== undefined
      ? { data: lastTypedPresentation.data }
      : {}),
    ...(background ? { background } : {}),
    ...(elements.length > 0 ? { elements } : {}),
    ...(audio.length > 0 ? { audio } : {}),
  };
}

function mergeAssets<TPresentationData>(
  sections: Section<TPresentationData>[],
): Record<string, Asset> {
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

function createEffectHandlers<TCustomEffectData>(
  handlers:
    | EffectHandlers<TCustomEffectData>
    | EffectHandlerMap<TCustomEffectData>
    | undefined,
): EffectHandlers<TCustomEffectData> {
  if (handlers instanceof EffectHandlers) return handlers;

  const registry = new EffectHandlers<TCustomEffectData>();

  for (const [type, handler] of Object.entries(handlers ?? {}) as [
    string,
    CustomEffectHandler<TCustomEffectData>,
  ][]) {
    registry.register(type, handler);
  }

  return registry;
}

function isCustomEffect<TCustomEffectData>(
  effect: Effect<TCustomEffectData>,
): effect is CustomEffect<TCustomEffectData> {
  return "type" in effect;
}

export class DecisionEngine<
  TContent = unknown,
  TPresentationData = unknown,
  TCustomEffectData = unknown,
> {
  private readonly effectHandlers: EffectHandlers<TCustomEffectData>;
  private readonly sceneMap: Map<
    string,
    Scene<TContent, TPresentationData, TCustomEffectData>
  >;
  private readonly sectionMap: Map<string, Section<TPresentationData>>;
  private readonly sceneSectionMap: Map<string, Section<TPresentationData>>;

  private story: Story<TContent, TPresentationData, TCustomEffectData>;
  private state: GameState;
  private unhandledCustomEffect: "throw" | "ignore";

  constructor(
    story: Story<TContent, TPresentationData, TCustomEffectData>,
    options: DecisionEngineOptions<TCustomEffectData> = {},
  ) {
    validateStory(story);

    this.story = story;
    this.effectHandlers = createEffectHandlers(options.effectHandlers);
    this.unhandledCustomEffect = options.unhandledCustomEffect ?? "throw";

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

  public getCurrentScene(): Scene<
    TContent,
    TPresentationData,
    TCustomEffectData
  > {
    const scene = this.getScene(this.state.currentSceneId);

    return {
      ...scene,
      choices: this.getAvailableChoices(scene.choices),
    };
  }

  public getCurrentSceneView(): SceneView<
    TContent,
    TPresentationData,
    TCustomEffectData
  > {
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

  public getSection(id: string): Section<TPresentationData> {
    const section = this.sectionMap.get(id);

    if (!section) {
      throw new Error(`Section not found: ${id}`);
    }

    return section;
  }

  public choose(
    choiceId: string,
  ): Scene<TContent, TPresentationData, TCustomEffectData> {
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

  public chooseView(
    choiceId: string,
  ): SceneView<TContent, TPresentationData, TCustomEffectData> {
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

  public loadStateView(
    state: GameState,
  ): SceneView<TContent, TPresentationData, TCustomEffectData> {
    this.loadState(state);

    return this.getCurrentSceneView();
  }

  public restart(): Scene<TContent, TPresentationData, TCustomEffectData> {
    this.state = {
      currentSceneId: this.story.startSceneId,
      history: [],
      variables: {},
    };

    return this.getCurrentScene();
  }

  public restartView(): SceneView<
    TContent,
    TPresentationData,
    TCustomEffectData
  > {
    this.restart();

    return this.getCurrentSceneView();
  }

  public goToScene(
    sceneId: string,
  ): Scene<TContent, TPresentationData, TCustomEffectData> {
    this.getScene(sceneId);
    this.state.history.push(this.state.currentSceneId);
    this.state.currentSceneId = sceneId;

    return this.getCurrentScene();
  }

  public goToSceneView(
    sceneId: string,
  ): SceneView<TContent, TPresentationData, TCustomEffectData> {
    this.goToScene(sceneId);

    return this.getCurrentSceneView();
  }

  private getAvailableChoices(
    choices: Choice<TCustomEffectData>[],
  ): Choice<TCustomEffectData>[] {
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

  private applyEffects(effects: Effect<TCustomEffectData>[]): void {
    effects.forEach((effect) => {
      if (isCustomEffect(effect)) {
        const handler = this.effectHandlers.get(effect.type);

        if (!handler) {
          if (this.unhandledCustomEffect === "ignore") return;

          throw new Error(`Unhandled custom effect: ${effect.type}`);
        }

        handler(effect, { state: cloneState(this.state) });
        return;
      }

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

  private getScene(
    id: string,
  ): Scene<TContent, TPresentationData, TCustomEffectData> {
    const scene = this.sceneMap.get(id);

    if (!scene) {
      throw new Error(`Scene not found: ${id}`);
    }

    return scene;
  }

  private getSectionChain(
    section: Section<TPresentationData>,
  ): Section<TPresentationData>[] {
    const sections: Section<TPresentationData>[] = [];
    let current: Section<TPresentationData> | undefined = section;

    while (current) {
      sections.unshift(current);
      current = current.parentSectionId
        ? this.sectionMap.get(current.parentSectionId)
        : undefined;
    }

    return sections;
  }
}
