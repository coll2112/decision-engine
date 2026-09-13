import type {
  Asset,
  Condition,
  CustomEffect,
  Scene,
  ScenePresentation,
  Section,
  VariableValue,
} from "../schema/index.js";

export type GameState = {
  currentSceneId: string;
  history: string[];
  variables: Record<string, VariableValue>;
  scheduledContent?: ScheduledContent[];
};

export type DeliveryConfig =
  | { type: "immediate" }
  | { type: "delayed"; minDelaySeconds: number; maxDelaySeconds: number; notify?: boolean };

export type ScheduledContentDefinition = {
  id: string;
  sourceId: string;
  conditions?: Condition[];
  delivery?: DeliveryConfig;
};

export type ScheduledContent = {
  id: string;
  sourceId: string;
  /** Absolute timestamp in milliseconds, using the injected clock's epoch. */
  deliverAt: number;
  delivered: boolean;
  notify: boolean;
};

export type SceneView<
  TContent = unknown,
  TPresentationData = unknown,
  TCustomEffectData = unknown,
> = {
  scene: Scene<TContent, TPresentationData, TCustomEffectData>;
  section?: Section<TPresentationData>;
  sections: Section<TPresentationData>[];
  assets: Record<string, Asset>;
  presentation?: ScenePresentation<TPresentationData>;
};

export type EffectContext = {
  state: GameState;
};

export type CustomEffectHandler<TData = unknown> = (
  effect: CustomEffect<TData>,
  context: EffectContext,
) => void;

export type EffectHandlerMap<TData = unknown> = Record<
  string,
  CustomEffectHandler<TData>
>;

export type DecisionEngineOptions<TCustomEffectData = unknown> = {
  scheduledContent?: readonly ScheduledContentDefinition[];
  clock?: () => number;
  random?: () => number;
  effectHandlers?: EffectHandlers<TCustomEffectData> | EffectHandlerMap<TCustomEffectData>;
  unhandledCustomEffect?: "throw" | "ignore";
};

export class EffectHandlers<TData = unknown> {
  private readonly handlers = new Map<string, CustomEffectHandler<TData>>();

  public register(type: string, handler: CustomEffectHandler<TData>): this {
    this.handlers.set(type, handler);

    return this;
  }

  public get(type: string): CustomEffectHandler<TData> | undefined {
    return this.handlers.get(type);
  }
}
