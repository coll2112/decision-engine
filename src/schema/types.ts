export type Story<
  TContent = unknown,
  TPresentationData = unknown,
  TCustomEffectData = unknown,
> = {
  id: string;
  title: string;
  startSceneId: string;
  /** Optional editor schema association; ignored by the engine. */
  $schema?: string;
  initialVariables?: Record<string, VariableValue>;
  sections?: Section<TPresentationData>[];
  scenes: Scene<TContent, TPresentationData, TCustomEffectData>[];
};

export type Section<TPresentationData = unknown> = {
  id: string;
  title?: string;
  parentSectionId?: string;
  presentation?: ScenePresentation<TPresentationData>;
  assets?: Record<string, Asset>;
  sceneIds?: string[];
};

export type Scene<
  TContent = unknown,
  TPresentationData = unknown,
  TCustomEffectData = unknown,
> = {
  id: string;
  content?: TContent;
  presentation?: ScenePresentation<TPresentationData>;
  speaker?: string;
  text: string;
  choices: Choice<TCustomEffectData>[];
};

export type ScenePresentation<TData = unknown> = {
  type?: string;
  data?: TData;
  background?: Asset;
  elements?: SceneElement[];
  audio?: SceneAudio[];
};

type BaseSceneElement = {
  id: string;
  positionX?: number;
  positionY?: number;
  width?: number;
  height?: number;
};

export type ImageElement = BaseSceneElement & {
  type: "image";
  asset: Asset;
};

export type HotspotElement = BaseSceneElement & {
  type: "hotspot";
  props?: Record<string, unknown>;
};

export type LightElement = BaseSceneElement & {
  type: "light";
  color?: string;
  intensity?: number;
  flicker?: boolean;
};

export type SceneElement = ImageElement | HotspotElement | LightElement;

export type SceneAudio = {
  music?: AudioTrack;
  ambience?: AudioTrack[];
  sfx?: AudioCue[];
};

export type AudioTrack = {
  id: string;
  src: string;
  volume?: number;
  loop?: boolean;
};

export type AudioCue = {
  id: string;
  src: string;
  volume?: number;
  delayMs?: number;
};

export type ChoiceNavigation =
  | { navigation?: "scene"; nextSceneId: string }
  | { navigation: "stay"; nextSceneId?: never };

export type Choice<TCustomEffectData = unknown> = ChoiceNavigation & {
  id: string;
  text: string;
  conditions?: Condition[];
  effects?: Effect<TCustomEffectData>[];
};

export type Condition = {
  variable: string;
  operator: "===" | "!==" | ">" | ">=" | "<" | "<=";
  value: VariableValue;
};

export type VariableEffect = {
  variable: string;
  operation: "set" | "increment" | "decrement";
  value: VariableValue;
};

export type CustomEffect<TData = unknown> = {
  type: string;
  data?: TData;
};

export type Effect<TCustomData = unknown> =
  | VariableEffect
  | CustomEffect<TCustomData>;

export type VariableValue = string | number | boolean;
export type Asset = { src: string };
