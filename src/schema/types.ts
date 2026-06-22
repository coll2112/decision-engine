export type Story = {
  id: string;
  title: string;
  startSceneId: string;
  sections?: Section[];
  scenes: Scene[];
};

export type Section = {
  id: string;
  title?: string;
  parentSectionId?: string;
  presentation?: ScenePresentation;
  assets?: Record<string, Asset>;
  sceneIds?: string[];
};

export type Scene = {
  id: string;
  presentation?: ScenePresentation;
  speaker?: string;
  text: string;
  choices: Choice[];
};

export type ScenePresentation = {
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

export type Choice = {
  id: string;
  text: string;
  nextSceneId: string;
  conditions?: Condition[];
  effects?: Effect[];
};

export type Condition = {
  variable: string;
  operator: "===" | "!==" | ">" | ">=" | "<" | "<=";
  value: VariableValue;
};

export type Effect = {
  variable: string;
  operation: "set" | "increment" | "decrement";
  value: VariableValue;
};

export type VariableValue = string | number | boolean;
export type Asset = { src: string };
