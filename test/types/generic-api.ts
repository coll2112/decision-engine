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

// Scheduled content and the shared evaluator are available from the public API.
import {
  evaluateConditions,
  type Condition,
  type DeliveryConfig,
  type DecisionEngineOptions,
  type GameState,
  type ScheduledContent,
  type ScheduledContentDefinition,
} from "../../src/index.js";

const delivery: DeliveryConfig = {
  type: "delayed", minDelaySeconds: 1, maxDelaySeconds: 3, notify: true,
};
const conditions: Condition[] = [{ variable: "ready", operator: "===", value: true }];
const definitions: ScheduledContentDefinition[] = [{ id: "item", sourceId: "source", delivery, conditions }];
const options: DecisionEngineOptions<AppEffectData> = {
  effectHandlers, scheduledContent: definitions, clock: () => 1000, random: () => 0.5,
};
const scheduledEngine = new DecisionEngine(story, options);
const scheduled: ScheduledContent[] = scheduledEngine.scheduleContent();
const all: ScheduledContent[] = scheduledEngine.getScheduledContent();
const pending: ScheduledContent[] = scheduledEngine.getPendingContent();
const due: ScheduledContent[] = scheduledEngine.getDueContent();
const delivered: ScheduledContent[] = scheduledEngine.getDeliveredContent();
const events: ScheduledContent[] = scheduledEngine.deliverDueContent();
const next: number | undefined = scheduledEngine.getNextDeliveryTime();
const legacySave: GameState = { currentSceneId: "room", history: [], variables: {} };
scheduledEngine.loadState(legacySave);
const saved: ScheduledContent[] | undefined = scheduledEngine.getState().scheduledContent;
const eligible: boolean = evaluateConditions(conditions, legacySave.variables);
const queriedScene = scheduledEngine.getScene("room");
const queriedChoices = scheduledEngine.getAvailableChoices("room");
type QueriedContentIsPreserved = Assert<IsEqual<typeof queriedScene.content, AdventureContent | undefined>>;
type QueriedEffectsArePreserved = Assert<IsEqual<typeof queriedChoices[number]["effects"], import("../../src/index.js").Effect<AppEffectData>[] | undefined>>;

// @ts-expect-error Delayed delivery requires both bounds.
const invalidDelivery: DeliveryConfig = { type: "delayed", minDelaySeconds: 1 };
// @ts-expect-error One canonical condition syntax.
const invalidCondition: Condition = { variable: "x", operator: "==", value: 1 };
// @ts-expect-error A persisted schedule requires its delivered flag.
const invalidSchedule: ScheduledContent = { id: "x", sourceId: "s", deliverAt: 1, notify: false };

import { stayChoice, type Choice, type ChoiceNavigation, type Story } from "../../src/index.js";
const typedDefaults: Story = { id: "defaults", title: "Defaults", startSceneId: "start", initialVariables: { seen: false, count: 0, label: "" }, scenes: [] };
const stay = stayChoice<AppEffectData>("Inspect", { effects: [{ type: "track", data: { id: "item" } }] });
const stayShape: Choice<AppEffectData> = { id: "inspect", text: "Inspect", navigation: "stay" };
const legacyChoice: Choice = { id: "go", text: "Go", nextSceneId: "room" };
const explicitTransition: Choice = { id: "go", text: "Go", navigation: "scene", nextSceneId: "room" };
function target(value: ChoiceNavigation): string | undefined {
  if (value.navigation === "stay") return undefined;
  const sceneId: string = value.nextSceneId;
  return sceneId;
}
// @ts-expect-error Defaults must use VariableValue.
typedDefaults.initialVariables = { nested: {} };
// @ts-expect-error Targetless choices must explicitly stay.
const missingNavigation: Choice = { id: "bad", text: "Bad" };
// @ts-expect-error Stay choices cannot also navigate.
const conflictingNavigation: Choice = { id: "bad", text: "Bad", navigation: "stay", nextSceneId: "room" };
// @ts-expect-error Scene navigation requires a target.
const missingTarget: Choice = { id: "bad", text: "Bad", navigation: "scene" };
// @ts-expect-error Transition builders cannot select stay navigation.
choice("Bad", "room", { navigation: "stay" });
// @ts-expect-error Stay builders cannot specify targets.
stayChoice("Bad", { nextSceneId: "room" });

// Builders preserve their specific navigation branch for existing callers.
const builderTarget: string = choice("Go", "room").nextSceneId;
const builderNavigation: "stay" = stayChoice("Inspect").navigation;
