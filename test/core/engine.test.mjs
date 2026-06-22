import assert from "node:assert/strict";
import test from "node:test";
import {
  DecisionEngine,
  choice,
  defineStory,
  scene,
  section,
} from "../../dist/index.js";

const createEngine = () =>
  new DecisionEngine(
    defineStory({
      id: "engine-test",
      title: "Engine Test",
      startSceneId: "desktop",
      sections: [
        section("desktop", ["desktop"], {
          assets: {
            wallpaper: { src: "/desktop.png" },
          },
          presentation: {
            background: { src: "/desktop-bg.png" },
            elements: [{ id: "shell", type: "hotspot" }],
          },
        }),
        section("forum", ["thread"], {
          assets: {
            chrome: { src: "/forum.png" },
          },
          parentSectionId: "desktop",
          presentation: {
            background: { src: "/forum-bg.png" },
            elements: [{ id: "browser", type: "hotspot" }],
          },
        }),
      ],
      scenes: [
        scene("desktop", "Desktop", [choice("Open thread", "thread")]),
        scene("thread", "Thread", [], {
          presentation: {
            elements: [{ id: "thread-link", type: "hotspot" }],
          },
        }),
      ],
    }),
  );

test("getCurrentSceneView returns inherited section presentation", () => {
  const engine = createEngine();
  const view = engine.chooseView("open-thread");

  assert.equal(view.section?.id, "forum");
  assert.deepEqual(
    view.sections.map((section) => section.id),
    ["desktop", "forum"],
  );
  assert.equal(view.presentation?.background?.src, "/forum-bg.png");
  assert.deepEqual(
    view.presentation?.elements?.map((element) => element.id),
    ["shell", "browser", "thread-link"],
  );
  assert.deepEqual(view.assets, {
    wallpaper: { src: "/desktop.png" },
    chrome: { src: "/forum.png" },
  });
});

test("getState returns a defensive copy", () => {
  const engine = createEngine();
  const state = engine.getState();

  state.currentSceneId = "thread";
  state.history.push("mutated");
  state.variables.changed = true;

  assert.equal(engine.getCurrentScene().id, "desktop");
  assert.deepEqual(engine.getState().history, []);
  assert.deepEqual(engine.getState().variables, {});
});

test("loadState rejects missing scenes", () => {
  const engine = createEngine();

  assert.throws(
    () =>
      engine.loadState({
        currentSceneId: "missing",
        history: [],
        variables: {},
      }),
    /Scene not found: missing/,
  );
});

test("goToSceneView records history and returns a scene view", () => {
  const engine = createEngine();
  const view = engine.goToSceneView("thread");

  assert.equal(view.scene.id, "thread");
  assert.deepEqual(engine.getState().history, ["desktop"]);
});
