import assert from "node:assert/strict";
import test from "node:test";
import { DecisionEngine, choice, stayChoice, scene, defineStory, parseStory } from "../../dist/index.js";

function story(initialVariables) {
  return defineStory({
    id: "defaults", title: "Defaults", startSceneId: "room",
    ...(initialVariables === undefined ? {} : { initialVariables }),
    scenes: [scene("room", "Room", [
      stayChoice("Inspect", {
        conditions: [{ variable: "seen", operator: "!==", value: true }],
        effects: [
          { variable: "count", operation: "increment", value: 1 },
          { variable: "seen", operation: "set", value: true },
          { type: "track", data: { action: "inspect" } },
        ],
      }),
      stayChoice("Again", { conditions: [{ variable: "seen", operator: "===", value: true }] }),
      choice("Loop", "room"),
      choice("Leave", "end", { navigation: "scene" }),
    ]), scene("end", "End")],
  });
}

test("defaults initialize, reset, and remain isolated from author and state mutations", () => {
  const defaults = { count: 0, seen: false, label: "" };
  const authored = story(defaults);
  const engine = new DecisionEngine(authored, { unhandledCustomEffect: "ignore" });
  const other = new DecisionEngine(authored);
  defaults.count = 10;
  authored.initialVariables = { count: 20 };
  const copy = engine.getState();
  copy.variables.count = 30;
  assert.deepEqual(engine.getState().variables, { count: 0, seen: false, label: "" });
  engine.choose("inspect");
  assert.equal(engine.getState().variables.count, 1);
  assert.equal(other.getState().variables.count, 0);
  engine.restartView();
  assert.deepEqual(engine.getState().variables, { count: 0, seen: false, label: "" });
  assert.deepEqual(engine.getState().history, []);
  assert.equal(engine.getCurrentScene().choices[0].id, "inspect");
});

test("load merges beneath saved falsy values and retains save-only variables", () => {
  const engine = new DecisionEngine(story({ count: 9, seen: true, label: "default", added: "new" }));
  const saved = { currentSceneId: "room", history: ["room"], variables: { count: 0, seen: false, label: "", extra: "old" } };
  const before = structuredClone(saved);
  engine.loadState(saved);
  assert.deepEqual(engine.getState().variables, { count: 0, seen: false, label: "", added: "new", extra: "old" });
  assert.deepEqual(saved, before);
  saved.variables.count = 100;
  assert.equal(engine.getState().variables.count, 0);
  engine.restart();
  assert.deepEqual(engine.getState().variables, { count: 9, seen: true, label: "default", added: "new" });
});

test("default variables reconcile scheduling only on explicit scheduling or load", () => {
  const definition = { id: "item", sourceId: "source", conditions: [{ variable: "seen", operator: "===", value: true }], delivery: { type: "delayed", minDelaySeconds: 1, maxDelaySeconds: 3 } };
  let samples = 0;
  const engine = new DecisionEngine(story({ seen: true }), { scheduledContent: [definition], clock: () => 1000, random: () => { samples++; return 0.5; } });
  assert.deepEqual(engine.getScheduledContent(), []);
  engine.loadState({ currentSceneId: "room", history: [], variables: {} });
  assert.equal(engine.getScheduledContent()[0].deliverAt, 3000);
  assert.equal(samples, 1);
  const saved = engine.getState();
  engine.loadState(saved);
  assert.equal(samples, 1);
  engine.restart();
  assert.deepEqual(engine.getScheduledContent(), []);
  assert.equal(engine.getState().variables.seen, true);
  engine.loadState({ currentSceneId: "room", history: [], variables: { seen: false } });
  assert.deepEqual(engine.getScheduledContent(), []);
  engine.restart();
  assert.equal(engine.scheduleContent().length, 1);
  assert.equal(samples, 2);
});

test("stay choice applies effects once, refreshes choices, and reconciles without history", () => {
  let calls = 0;
  const engine = new DecisionEngine(story({ count: 0 }), {
    effectHandlers: { track: () => { calls++; } },
    scheduledContent: [{ id: "item", sourceId: "source", conditions: [{ variable: "seen", operator: "===", value: true }] }],
    clock: () => 42,
  });
  engine.goToScene("room");
  const beforeHistory = engine.getState().history;
  const view = engine.chooseView("inspect");
  assert.equal(view.scene.id, "room");
  assert.deepEqual(view.scene.choices.map((item) => item.id), ["again", "loop", "leave"]);
  assert.deepEqual(engine.getState().history, beforeHistory);
  assert.equal(engine.getState().variables.count, 1);
  assert.equal(calls, 1);
  assert.equal(engine.getDueContent()[0].deliverAt, 42);
  assert.throws(() => engine.choose("inspect"), /Choice not found/);
  assert.equal(calls, 1);
  engine.choose("again");
  assert.deepEqual(engine.getState().history, beforeHistory);
  assert.equal(engine.getScheduledContent().length, 1);
  engine.choose("loop");
  assert.deepEqual(engine.getState().history, ["room", "room"]);
  engine.choose("leave");
  assert.equal(engine.getState().currentSceneId, "end");
  assert.deepEqual(engine.getState().history, ["room", "room", "room"]);
});

test("failed stay choice rolls back effects and does not schedule", () => {
  const engine = new DecisionEngine(story({ count: 0 }));
  const before = engine.getState();
  assert.throws(() => engine.choose("inspect"), /Unhandled custom effect/);
  assert.deepEqual(engine.getState(), before);
});

test("legacy stories and empty defaults preserve variable behavior", () => {
  for (const defaults of [undefined, {}]) {
    const engine = new DecisionEngine(story(defaults));
    assert.deepEqual(engine.getState().variables, {});
    engine.loadState({ currentSceneId: "room", history: [], variables: { custom: false } });
    assert.deepEqual(engine.getState().variables, { custom: false });
    engine.restart();
    assert.deepEqual(engine.getState().variables, {});
  }
});

for (const value of [null, [], "bad", { x: null }, { x: {} }, { x: [] }, { x: undefined }, { x: NaN }, { x: Infinity }]) {
  test(`invalid defaults rejected: ${JSON.stringify(value)}`, () => {
    assert.throws(() => parseStory(story(value)), /Story.initialVariables/);
    assert.throws(() => new DecisionEngine(story(value)), /Story.initialVariables/);
  });
}

test("invalid loaded variables cannot fall back to defaults or replace state", () => {
  const engine = new DecisionEngine(story({ count: 1 }));
  const before = engine.getState();
  for (const count of [null, undefined, {}, NaN]) {
    assert.throws(() => engine.loadState({ currentSceneId: "end", history: [], variables: { count } }), /GameState.variables.count/);
    assert.deepEqual(engine.getState(), before);
  }
});
