import type {
  Asset,
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

export type SceneView = {
  scene: Scene;
  section?: Section;
  sections: Section[];
  assets: Record<string, Asset>;
  presentation?: ScenePresentation;
};
