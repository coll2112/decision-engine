import type {
  Asset,
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
