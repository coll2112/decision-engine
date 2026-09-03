import {
  DecisionEngine,
  EffectHandlers,
  choice,
  defineStory,
  scene,
  section,
} from "../../src/index.js";

type AdventureContent =
  | { kind: "room"; exits: string[] }
  | { kind: "inspect"; itemId: string };

type PresentationData = {
  layout: "dialogue" | "map";
};

type AppEffectData = {
  id: string;
};

type IsEqual<TActual, TExpected> =
  (<T>() => T extends TActual ? 1 : 2) extends
  <T>() => T extends TExpected ? 1 : 2
    ? true
    : false;

type Assert<T extends true> = T;

const effectHandlers = new EffectHandlers<AppEffectData>().register(
  "showOverlay",
  (effect) => {
    const id: string | undefined = effect.data?.id;

    return id;
  },
);

const story = defineStory<AdventureContent, PresentationData, AppEffectData>({
  id: "typed-story",
  title: "Typed Story",
  startSceneId: "room",
  sections: [
    section<PresentationData>("map", ["room"], {
      presentation: {
        type: "layout",
        data: { layout: "map" },
      },
    }),
  ],
  scenes: [
    scene<AdventureContent, PresentationData, AppEffectData>(
      "room",
      "A quiet room.",
      [
        choice<AppEffectData>("Inspect", "inspect", {
          effects: [
            {
              type: "showOverlay",
              data: { id: "clue" },
            },
          ],
        }),
      ],
      {
        content: {
          kind: "room",
          exits: ["hallway"],
        },
        presentation: {
          type: "layout",
          data: { layout: "dialogue" },
        },
      },
    ),
    scene<AdventureContent, PresentationData, AppEffectData>(
      "inspect",
      "A clue.",
      [],
      {
        content: {
          kind: "inspect",
          itemId: "clue",
        },
      },
    ),
  ],
});

const engine = new DecisionEngine<
  AdventureContent,
  PresentationData,
  AppEffectData
>(story, { effectHandlers });

const currentScene = engine.getCurrentScene();
const currentView = engine.getCurrentSceneView();
const currentPresentationData = currentView.presentation?.data;

type SceneContentIsPreserved = Assert<
  IsEqual<typeof currentScene.content, AdventureContent | undefined>
>;

type ViewSceneContentIsPreserved = Assert<
  IsEqual<typeof currentView.scene.content, AdventureContent | undefined>
>;

type ViewPresentationDataIsPreserved = Assert<
  IsEqual<typeof currentPresentationData, PresentationData | undefined>
>;
