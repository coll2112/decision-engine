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

`getState()` returns a defensive copy. `loadState()` validates that the saved `currentSceneId` exists before loading it.

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
