# Decision Engine

A small TypeScript decision engine for branching story data, runtime state, and optional section-aware presentation inheritance.

This package is renderer-agnostic. Use it from games, visual novels, point-and-click tools, story editors, web apps, or any runtime that can consume JSON story data.

## Install

For a private GitHub Packages install, add an `.npmrc` to the consuming project:

```ini
@coll2112:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

Then install:

```sh
npm install @coll2112/decision-engine
```

## Usage

```ts
import { DecisionEngine, choice, defineStory, scene } from "@coll2112/decision-engine";

const story = defineStory({
  id: "hello",
  title: "Hello",
  startSceneId: "start",
  scenes: [
    scene("start", "You wake up.", [
      choice("Open the door", "hallway"),
    ]),
    scene("hallway", "The hallway is quiet."),
  ],
});

const engine = new DecisionEngine(story);

console.log(engine.getCurrentScene());
engine.choose("open-the-door");
console.log(engine.getCurrentScene());
```

## Loading JSON Stories

Use `parseStory` when loading unknown JSON:

```ts
import { DecisionEngine, parseStory } from "@coll2112/decision-engine";
import storyJson from "./story.json";

const story = parseStory(storyJson);
const engine = new DecisionEngine(story);
```

## Authoring defaults and stay-in-place choices

Set `Story.initialVariables` to string, finite number, or boolean defaults:

```ts
import { defineStory, scene, stayChoice, choice } from "@coll2112/decision-engine";

const story = defineStory({
  id: "room",
  title: "A room",
  startSceneId: "room",
  initialVariables: { inspected: false, clues: 0, label: "" },
  scenes: [
    scene("room", "Look around.", [
      stayChoice("Inspect", {
        conditions: [{ variable: "inspected", operator: "===", value: false }],
        effects: [
          { variable: "inspected", operation: "set", value: true },
          { variable: "clues", operation: "increment", value: 1 },
        ],
      }),
      choice("Leave", "hall"),
    ]),
    scene("hall", "The hallway."),
  ],
});
```

New engines snapshot the defaults. New games and restarts use independent copies; modifying the authored defaults later does not affect an existing engine. Loads merge defaults beneath saved variables before reconciling schedules. Saved `false`, `0`, `""`, and variables absent from the defaults are preserved. Invalid saved values are rejected, not replaced with defaults. Stories without defaults continue to start with `{}`.

`stayChoice()` produces the canonical JSON shape `{ id, text, navigation: "stay", conditions?, effects? }`. It applies effects once per successful selection, reconciles schedules, and returns the current scene with refreshed available choices, without adding history. To make it selectable only once, use a condition and effect as above.

Target-based choices remain `{ id, text, nextSceneId, ... }`; an optional `navigation: "scene"` explicitly identifies that branch of the exported `ChoiceNavigation` union. Self-transitions still add history. Stay choices must omit `nextSceneId`; scene choices must supply it. Missing targets, conflicting instructions, and unknown navigation values are rejected.

## Editor JSON Schema

The package exports a Draft 7 schema asset at `@coll2112/decision-engine/story.schema.json`. Associate a JSON story with its installed file using `$schema` (adjust the relative path for your story's directory):

```json
{
  "$schema": "./node_modules/@coll2112/decision-engine/schema/story.schema.json",
  "id": "example",
  "title": "Example",
  "startSceneId": "room",
  "initialVariables": { "inspected": false },
  "scenes": [{
    "id": "room",
    "text": "A quiet room.",
    "choices": [{
      "id": "inspect",
      "text": "Inspect",
      "navigation": "stay",
      "effects": [{ "variable": "inspected", "operation": "set", "value": true }]
    }]
  }]
}
```

The engine accepts and ignores `$schema`. Editors can validate story structure, defaults, choices/navigation, conditions, effects, sections, assets, and built-in presentation hints. Custom scene `content`, presentation `data`, custom effect `data`, and hotspot `props` remain extensible.

Reusable fragments include `#/definitions/condition`, `effect`, `navigation`, `delivery`, `scheduledContentDefinition`, and `scheduledContentDefinitions` (an array). Append a full fragment such as `#/definitions/delivery` to the schema path when associating a standalone JSON document. Scheduling definitions remain engine options; they are not a new story field.

Run `parseStory` or construct `DecisionEngine` as well as using editor validation. Portable JSON Schema cannot check scene/section references, ID uniqueness by field, section cycles, scheduling identity pairs, or compare `minDelaySeconds` with `maxDelaySeconds`; runtime validation retains those checks. JSON cannot represent non-finite numbers, which runtime validation also rejects.

### Migrating from 0.1.x

Existing `nextSceneId` choices and saves need no rewrite. Add defaults when introducing variables to older saves. Replace a self-transition with `navigation: "stay"` only when you want to stop adding history. Code that reads `choice.nextSceneId` must first exclude `choice.navigation === "stay"`. Built-in presentation fields now receive structural validation consistent with their TypeScript types and editor schema; keep application-specific payloads in `content` or `data`.

## Optional Sections

Sections are optional. A simple visual novel or point-and-click game can use only scenes.

Use sections when a set of scenes shares presentation, assets, or container context:

```ts
import { defineStory, scene, section } from "@coll2112/decision-engine";

const story = defineStory({
  id: "os-game",
  title: "OS Game",
  startSceneId: "desktop",
  sections: [
    section("desktop", ["desktop"], {
      presentation: {
        background: { src: "/wallpaper.png" },
      },
    }),
    section("forum", ["board", "thread"], {
      parentSectionId: "desktop",
      presentation: {
        elements: [{ id: "browser-shell", type: "hotspot" }],
      },
    }),
  ],
  scenes: [
    scene("desktop", "Desktop"),
    scene("board", "Forum board"),
    scene("thread", "Forum thread"),
  ],
});
```

Renderers that need inherited context can use:

```ts
const view = engine.getCurrentSceneView();

view.scene; // current scene with available choices
view.section; // leaf section for the current scene
view.sections; // root-to-leaf section chain
view.presentation; // merged section + scene presentation
view.assets; // merged section assets
```

## Custom Scene Content

Scenes can carry game-specific JSON content. The engine preserves that content and returns it from scene APIs, but does not interpret it.

```ts
import { DecisionEngine, defineStory, scene } from "@coll2112/decision-engine";

type AdventureContent =
  | { kind: "room"; exits: string[] }
  | { kind: "inspect"; itemId: string };

const story = defineStory<AdventureContent>({
  id: "adventure",
  title: "Adventure",
  startSceneId: "room",
  scenes: [
    scene<AdventureContent>("room", "A quiet room.", [], {
      content: {
        kind: "room",
        exits: ["hallway"],
      },
    }),
  ],
});

const engine = new DecisionEngine<AdventureContent>(story);
const sceneWithContent = engine.getCurrentScene();

sceneWithContent.content; // AdventureContent | undefined
```

Existing `speaker`, `text`, `choices`, `conditions`, `effects`, and `presentation` fields remain supported, so older stories do not need to be rewritten.

## Extensible Presentation

Presentation hints can also carry generic data. Built-in presentation fields such as `background`, `elements`, and `audio` still work, while `type` and `data` let a renderer opt into richer layout information.

```ts
type PresentationData = { layout: "dialogue" | "map" };

const story = defineStory<unknown, PresentationData>({
  id: "presentation",
  title: "Presentation",
  startSceneId: "start",
  scenes: [
    scene<unknown, PresentationData>("start", "Start", [], {
      presentation: {
        type: "scene-layout",
        data: { layout: "dialogue" },
      },
    }),
  ],
});
```

## Custom Effects

The engine continues to execute built-in variable effects:

```ts
{
  variable: "trust",
  operation: "increment",
  value: 1,
}
```

Games can register handlers for custom effects. The engine dispatches these effects by `type` and leaves their meaning to the consuming application.

```ts
import { DecisionEngine, EffectHandlers } from "@coll2112/decision-engine";

type AppEffectData = { id: string };

const effectHandlers = new EffectHandlers<AppEffectData>().register(
  "showOverlay",
  (effect) => {
    showOverlay(effect.data?.id);
  },
);

const engine = new DecisionEngine(story, { effectHandlers });
```

Unhandled custom effects throw by default. Pass `{ unhandledCustomEffect: "ignore" }` if the host application wants to tolerate missing handlers.

## Custom Validation

`parseStory` and `assertStory` validate the story structure owned by the engine. If a game wants to validate custom scene content or presentation data, it can provide narrow hooks:

```ts
const story = parseStory<AdventureContent>(storyJson, {
  validateSceneContent(content, sceneId) {
    if (content.kind !== "room" && content.kind !== "inspect") {
      throw new Error(`Scene ${sceneId} has unsupported content`);
    }
  },
});
```

## Runtime API

```ts
engine.getCurrentScene();
engine.getCurrentSceneView();

engine.choose("choice-id");
engine.chooseView("choice-id");

engine.goToScene("scene-id");
engine.goToSceneView("scene-id");

engine.restart();
engine.restartView();

const save = engine.getState();
engine.loadState(save);
engine.loadStateView(save);
```

`getState()` returns a defensive copy, including scheduling records. `loadState()` validates the current scene, history/variables shape, and every scheduling record before replacing state. Saves without `scheduledContent` remain supported.

### Read-only scene queries

`getScene(sceneId)` returns a scene with all its authored choices. `getAvailableChoices(sceneId)` filters that scene's choices against the current variables. Neither navigates, changes history, or schedules content. `getCurrentScene()` continues to return the current scene with available choices. Scene/choice shells, conditions, and effects are copied; opaque content, presentation, and custom effect payloads remain application-owned and should be treated as immutable.

### Shared conditions and validation

`evaluateConditions(conditions, variables)` is the evaluator used by choices and scheduled content. Missing or empty conditions match; otherwise all conditions must match. Equality (`===`, `!==`) is strict, and ordering (`>`, `>=`, `<`, `<=`) uses `Number` coercion, including the existing behavior for missing variables.

The canonical condition shape is `{ variable, operator, value }`. Built-in effects use `{ variable, operation: "set" | "increment" | "decrement", value }`; custom effects use `{ type, data? }`. Validation rejects unsupported fields in these shapes, invalid operators/operations or values, and duplicate choice IDs within a scene. Errors include the scene, choice/content identity, and field. Custom content and presentation validation hooks remain available.

## Scheduled content

Pass renderer-independent definitions in `DecisionEngineOptions.scheduledContent`. The engine tracks `(sourceId, id)` pairs; `sourceId` is an opaque namespace and need not identify a scene. Different sources can reuse an ID.

```ts
import { DecisionEngine, type DeliveryConfig } from "@coll2112/decision-engine";

const delivery: DeliveryConfig = {
  type: "delayed",
  minDelaySeconds: 2,
  maxDelaySeconds: 5,
  notify: true,
};
const engine = new DecisionEngine(story, {
  scheduledContent: [{
    id: "clue",
    sourceId: "chapter-one",
    conditions: [{ variable: "foundKey", operator: "===", value: true }],
    delivery,
  }],
  clock: Date.now,       // absolute milliseconds; defaults to Date.now
  random: Math.random, // value in [0, 1); defaults to Math.random
});

// For a fresh timeline, reconcile initial eligibility explicitly.
engine.scheduleContent();
// For a saved timeline, use engine.loadState(save) instead: it restores first.

engine.choose("choice-id"); // successful effects automatically reconcile eligibility
const deadline = engine.getNextDeliveryTime(); // number | undefined

// The host calls this at a time of its choosing.
const events = engine.deliverDueContent();
for (const event of events) {
  // Resolve event.sourceId/event.id in host content; event.notify is a hint.
}
const save = engine.getState(); // host owns persistence storage
```

`DeliveryConfig` is `{ type: "immediate" }` or `{ type: "delayed", minDelaySeconds, maxDelaySeconds, notify? }`. Missing delivery behaves like immediate delivery: eligible content has no waiting period and consumes no randomness. Existing scene/choice behavior is unchanged. These definitions do not hide scenes or navigate automatically.

Construction and getters do not schedule. `scheduleContent()` explicitly reconciles and returns newly scheduled records; successful choices and loads also reconcile. `restart()` clears the timeline, including schedules; call `scheduleContent()` again to reconcile initial content. Navigation preserves schedules. Delivery is always explicit, including immediate items.

Delayed content samples once when first scheduled: `min + random() * (max - min)` seconds. Equal bounds use that fixed delay without randomness. Bounds must be finite, nonnegative, and ordered; zero and fractional delays are allowed. `deliverAt` is an absolute millisecond timestamp. Timestamps must be finite, nonnegative, and within JavaScript's safe number range. `notify` defaults to `false`.

| Method | Result |
| --- | --- |
| `getScheduledContent()` | All persisted records, copied |
| `getPendingContent()` | All undelivered records, including currently ineligible ones |
| `getDueContent()` | Eligible undelivered records with `deliverAt <= clock()` |
| `getDeliveredContent()` | Records already delivered, regardless of current eligibility |
| `getNextDeliveryTime()` | Earliest eligible undelivered deadline, possibly overdue; otherwise `undefined` |
| `deliverDueContent()` | Marks due records delivered and returns newly delivered copies |

Conditions remain authoritative at delivery time. An invalidated branch retains its deadline but cannot deliver until eligible again; an overdue item then delivers on the next explicit delivery call. Records whose definitions are absent from the current engine are preserved but cannot deliver. Each record persists `{ id, sourceId, deliverAt, delivered, notify }` in optional `GameState.scheduledContent`.

Loading restores records before reconciling new eligibility, so existing timestamps, flags, and notification hints never re-roll. Malformed records and duplicate identities are rejected before replacing valid state. Returned records and loaded schedules are defensively copied. Persist state after delivery to preserve event deduplication across loads. Restoring an older snapshot from before delivery can emit the event again; the engine does not coordinate external storage or side effects.

Hosts own timers, storage, and the interpretation of event signals. No renderer or platform timer is required. Failed choices roll back engine state; external side effects from custom handlers cannot be rolled back.

## Development

This package expects Node 18 or newer. If you use `nvm`, run `nvm use` first.

```sh
nvm use
npm install
npm run verify
npm run build
```

Build output is written to `dist`.

## Publish Private Package To GitHub Packages

1. Log in:

```sh
npm login --scope=@coll2112 --auth-type=legacy --registry=https://npm.pkg.github.com
```

Use your GitHub username and a GitHub personal access token classic with `write:packages`, `read:packages`, and `repo`.

2. Verify:

```sh
npm run verify
```

3. Publish:

```sh
npm publish
```

GitHub Packages are private by default when first published from a private repository. Confirm package visibility and repository access in GitHub after publishing.
