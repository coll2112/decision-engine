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
  type ScheduledContent,
  type ScheduledContentDefinition,
} from "./types.js";

import { evaluateConditions } from "./conditions.js";
import { schedulingIdentity, timestamp, validateDefinitions, validateSchedules } from "./scheduling.js";
import { object, variableValue } from "../schema/shape-validation.js";

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
    ...(state.scheduledContent !== undefined
      ? { scheduledContent: state.scheduledContent.map((item) => ({ ...item })) }
      : {}),
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

  private readonly definitions: Map<string, ScheduledContentDefinition>;
  private readonly initialVariables: GameState["variables"];
  private readonly clock: () => number;
  private readonly random: () => number;

  private story: Story<TContent, TPresentationData, TCustomEffectData>;
  private state: GameState;
  private unhandledCustomEffect: "throw" | "ignore";

  constructor(
    story: Story<TContent, TPresentationData, TCustomEffectData>,
    options: DecisionEngineOptions<TCustomEffectData> = {},
  ) {
    validateStory(story);

    validateDefinitions(options.scheduledContent === undefined ? [] : options.scheduledContent);
    this.definitions = new Map((options.scheduledContent ?? []).map((item) => [
      schedulingIdentity(item),
      { ...item, conditions: item.conditions?.map((condition) => ({ ...condition })),
        delivery: item.delivery ? { ...item.delivery } : undefined },
    ]));
    this.clock = options.clock ?? Date.now;
    this.random = options.random ?? Math.random;
    if (typeof this.clock !== "function") throw new Error("clock must be a function");
    if (typeof this.random !== "function") throw new Error("random must be a function");
    this.story = story;
    this.initialVariables = { ...story.initialVariables };
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
      variables: { ...this.initialVariables },
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
      choices: this.getAvailableChoices(scene.id),
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

    const previousState = this.state;
    this.state = cloneState(previousState);
    try {
      this.applyEffects(choice.effects ?? []);
      this.scheduleContent();
    } catch (error) {
      this.state = previousState;
      throw error;
    }

    if (choice.navigation !== "stay") {
      this.state.history.push(currentScene.id);
      this.state.currentSceneId = choice.nextSceneId;
    }

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
    object(state, "GameState");
    this.getScene(state.currentSceneId);
    if (!Array.isArray(state.history) || !state.history.every((id) => typeof id === "string")) {
      throw new Error("GameState.history must be a string array");
    }
    object(state.variables, "GameState.variables");
    for (const [key, value] of Object.entries(state.variables)) variableValue(value, `GameState.variables.${key}`);
    validateSchedules(state.scheduledContent);
    const restored = cloneState(state);
    restored.variables = { ...this.initialVariables, ...restored.variables };
    // Reconcile against the restored timeline, never the previous engine state.
    this.reconcileSchedules(restored);
    this.state = restored;
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
      variables: { ...this.initialVariables },
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

  /** Queries another scene without navigation or schedule reconciliation. */
  public getAvailableChoices(sceneId: string): Choice<TCustomEffectData>[] {
    return this.getScene(sceneId).choices.filter((choice) =>
      evaluateConditions(choice.conditions, this.state.variables),
    );
  }

  /** Reconcile eligibility explicitly; returns only newly scheduled records. */
  public scheduleContent(): ScheduledContent[] {
    return this.reconcileSchedules(this.state);
  }

  public getScheduledContent(): ScheduledContent[] {
    return (this.state.scheduledContent ?? []).map((item) => ({ ...item }));
  }

  /** Includes all undelivered records, even those currently ineligible. */
  public getPendingContent(): ScheduledContent[] {
    return this.getScheduledContent().filter((item) => !item.delivered);
  }

  public getDueContent(): ScheduledContent[] {
    const now = this.now();
    return this.getPendingContent().filter((item) => item.deliverAt <= now && this.isEligible(item));
  }

  public getDeliveredContent(): ScheduledContent[] {
    return this.getScheduledContent().filter((item) => item.delivered);
  }

  /** Earliest eligible undelivered deadline; can be in the past. */
  public getNextDeliveryTime(): number | undefined {
    let next: number | undefined;
    for (const item of this.state.scheduledContent ?? []) {
      if (!item.delivered && this.isEligible(item) && (next === undefined || item.deliverAt < next)) next = item.deliverAt;
    }
    return next;
  }

  /** Marks due, eligible records delivered and returns each event once. */
  public deliverDueContent(): ScheduledContent[] {
    const due = this.getDueContent();
    const identities = new Set(due.map(schedulingIdentity));
    for (const item of this.state.scheduledContent ?? []) {
      if (identities.has(schedulingIdentity(item))) item.delivered = true;
    }
    return due.map((item) => ({ ...item, delivered: true }));
  }

  private now(): number {
    const now = this.clock();
    timestamp(now, "clock timestamp");
    return now;
  }

  private isEligible(item: ScheduledContent): boolean {
    const definition = this.definitions.get(schedulingIdentity(item));
    return definition !== undefined && evaluateConditions(definition.conditions, this.state.variables);
  }

  private reconcileSchedules(state: GameState): ScheduledContent[] {
    const existing = new Set((state.scheduledContent ?? []).map(schedulingIdentity));
    const added: ScheduledContent[] = [];
    let now: number | undefined;
    for (const [key, definition] of this.definitions) {
      if (existing.has(key) || !evaluateConditions(definition.conditions, state.variables)) continue;
      now ??= this.now();
      const delivery = definition.delivery;
      let delay = 0;
      if (delivery?.type === "delayed") {
        const sample = delivery.minDelaySeconds === delivery.maxDelaySeconds ? 0 : this.random();
        if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
          throw new Error(`Content ${definition.sourceId}/${definition.id}.delivery random sample must be in [0, 1)`);
        }
        delay = (delivery.minDelaySeconds + sample * (delivery.maxDelaySeconds - delivery.minDelaySeconds)) * 1000;
      }
      const deliverAt = now + delay;
      timestamp(deliverAt, `Content ${definition.sourceId}/${definition.id}.deliverAt`);
      added.push({ id: definition.id, sourceId: definition.sourceId, deliverAt,
        delivered: false, notify: delivery?.type === "delayed" ? delivery.notify ?? false : false });
    }
    // Commit only after every new record has been validated.
    if (added.length) state.scheduledContent = [...(state.scheduledContent ?? []), ...added];
    return added.map((item) => ({ ...item }));
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

  public getScene(
    id: string,
  ): Scene<TContent, TPresentationData, TCustomEffectData> {
    const scene = this.sceneMap.get(id);

    if (!scene) {
      throw new Error(`Scene not found: ${id}`);
    }

    return {
      ...scene,
      choices: scene.choices.map((choice) => ({
        ...choice,
        ...(choice.conditions ? { conditions: choice.conditions.map((condition) => ({ ...condition })) } : {}),
        ...(choice.effects ? { effects: choice.effects.map((effect) => ({ ...effect })) } : {}),
      })),
    };
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
