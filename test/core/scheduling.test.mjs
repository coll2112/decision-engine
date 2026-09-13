import assert from "node:assert/strict";
import test from "node:test";
import { DecisionEngine, evaluateConditions } from "../../dist/index.js";

const condition = { variable: "ready", operator: "===", value: true };
const story = () => ({
  id: "scheduled", title: "Scheduled", startSceneId: "start",
  scenes: [
    { id: "start", text: "Start", choices: [
      { id: "enable", text: "Enable", nextSceneId: "other", effects: [{ variable: "ready", operation: "set", value: true }] },
      { id: "gated", text: "Gated", nextSceneId: "other", conditions: [condition] },
      { id: "fail", text: "Fail", nextSceneId: "other", effects: [{ variable: "ready", operation: "set", value: true }, { type: "unhandled" }] },
    ] },
    { id: "other", text: "Other", choices: [
      { id: "disable", text: "Disable", nextSceneId: "start", effects: [{ variable: "ready", operation: "set", value: false }] },
    ] },
  ],
});
const definition = (overrides = {}) => ({
  id: "item", sourceId: "source", conditions: [condition],
  delivery: { type: "delayed", minDelaySeconds: 2, maxDelaySeconds: 4, notify: true },
  ...overrides,
});
function setup(definitions = [definition()]) {
  let now = 1000;
  let samples = 0;
  const engine = new DecisionEngine(story(), {
    scheduledContent: definitions, clock: () => now,
    random: () => { samples++; return 0.5; },
  });
  return { engine, time: (value) => { now = value; }, samples: () => samples };
}

test("legacy engine state and immediate definitions need no delay or random sampling", () => {
  const legacy = new DecisionEngine(story());
  assert.deepEqual(legacy.getState(), { currentSceneId: "start", history: [], variables: {} });
  legacy.choose("enable");
  assert.equal(legacy.getState().scheduledContent, undefined);
  const { engine, samples } = setup([definition({ conditions: undefined, delivery: undefined }), definition({ id: "explicit", conditions: [], delivery: { type: "immediate" } })]);
  assert.equal(engine.getScheduledContent().length, 0);
  assert.equal(engine.scheduleContent().length, 2);
  assert.equal(samples(), 0);
  assert.deepEqual(engine.getDueContent().map((item) => [item.deliverAt, item.notify]), [[1000, false], [1000, false]]);
  assert.equal(engine.deliverDueContent().length, 2);
});

test("choice eligibility samples once, preserves navigation, and delivers at the boundary", () => {
  const { engine, time, samples } = setup();
  assert.deepEqual(engine.scheduleContent(), []);
  engine.choose("enable");
  assert.equal(samples(), 1);
  assert.equal(engine.getNextDeliveryTime(), 4000);
  engine.goToScene("start");
  engine.choose("gated");
  assert.deepEqual(engine.scheduleContent(), []);
  assert.equal(samples(), 1);
  time(3999);
  assert.deepEqual(engine.getDueContent(), []);
  time(4000);
  assert.equal(engine.getDueContent().length, 1);
  assert.equal(engine.getPendingContent().length, 1);
  assert.deepEqual(engine.deliverDueContent(), [{ id: "item", sourceId: "source", deliverAt: 4000, delivered: true, notify: true }]);
  assert.deepEqual(engine.deliverDueContent(), []);
  assert.equal(engine.getNextDeliveryTime(), undefined);
  assert.equal(engine.getDeliveredContent().length, 1);
  assert.equal(engine.getPendingContent().length, 0);
});

test("invalidated branches retain deadlines and can deliver overdue when eligible again", () => {
  const { engine, time, samples } = setup();
  engine.choose("enable");
  engine.choose("disable");
  time(9000);
  assert.equal(engine.getPendingContent()[0].deliverAt, 4000);
  assert.equal(engine.getNextDeliveryTime(), undefined);
  assert.deepEqual(engine.deliverDueContent(), []);
  engine.choose("enable");
  assert.equal(samples(), 1);
  assert.equal(engine.deliverDueContent().length, 1);
  engine.choose("disable");
  engine.choose("enable");
  assert.deepEqual(engine.deliverDueContent(), []);
});

test("source and content pairs schedule independently with collision-safe identities", () => {
  const { engine, time } = setup([
    definition({ sourceId: "a/b", id: "c" }),
    definition({ sourceId: "a", id: "b/c", delivery: { type: "delayed", minDelaySeconds: 8, maxDelaySeconds: 8 } }),
    definition({ sourceId: "different", id: "c", delivery: { type: "immediate" } }),
  ]);
  engine.choose("enable");
  assert.equal(engine.getPendingContent().length, 3);
  assert.equal(engine.deliverDueContent().length, 1);
  time(4000);
  assert.equal(engine.deliverDueContent().length, 1);
  assert.equal(engine.getNextDeliveryTime(), 9000);
  time(9000);
  assert.equal(engine.deliverDueContent().length, 1);
});

test("save/load restores before reconciliation and persists event deduplication", () => {
  const first = setup();
  first.engine.choose("enable");
  const save = JSON.parse(JSON.stringify(first.engine.getState()));
  const second = setup();
  second.time(10000);
  second.engine.loadState(save);
  assert.equal(second.samples(), 0);
  assert.equal(second.engine.getNextDeliveryTime(), 4000);
  assert.equal(second.engine.deliverDueContent().length, 1);
  const third = setup();
  third.time(20000);
  third.engine.loadState(second.engine.getState());
  assert.equal(third.samples(), 0);
  assert.deepEqual(third.engine.deliverDueContent(), []);
});

test("older saves reconcile eligible definitions and unknown saved identities remain inert", () => {
  const { engine, time } = setup();
  engine.loadState({ currentSceneId: "other", history: [], variables: { ready: true } });
  assert.equal(engine.getScheduledContent()[0].deliverAt, 4000);
  const save = engine.getState();
  save.scheduledContent.push({ id: "removed", sourceId: "old", deliverAt: 0, delivered: false, notify: true });
  engine.loadState(save);
  time(5000);
  assert.deepEqual(engine.deliverDueContent().map((item) => item.id), ["item"]);
  assert.equal(engine.getPendingContent()[0].id, "removed");
});

test("restart clears schedules and begins a new timeline", () => {
  const { engine, time, samples } = setup();
  engine.choose("enable");
  time(4000);
  engine.deliverDueContent();
  engine.restart();
  assert.deepEqual(engine.getState(), { currentSceneId: "start", history: [], variables: {} });
  engine.choose("enable");
  assert.equal(samples(), 2);
  assert.equal(engine.getNextDeliveryTime(), 7000);
  time(7000);
  assert.equal(engine.deliverDueContent().length, 1);
});

test("schedule state, definitions, inputs, and returned events are defensively cloned", () => {
  const item = definition();
  const { engine, time } = setup([item]);
  item.conditions[0] = { ...condition, value: false };
  item.delivery.minDelaySeconds = 100;
  const added = engine.loadState({ currentSceneId: "start", history: [], variables: { ready: true } });
  assert.equal(added, undefined);
  const scheduled = engine.scheduleContent();
  assert.deepEqual(scheduled, []);
  for (const records of [engine.getState().scheduledContent, engine.getScheduledContent(), engine.getPendingContent()]) {
    records[0].deliverAt = 99999;
    records[0].delivered = true;
    records.push({});
  }
  const save = engine.getState();
  engine.loadState(save);
  save.scheduledContent[0].deliverAt = 99999;
  time(4000);
  engine.getDueContent()[0].delivered = true;
  const events = engine.deliverDueContent();
  events[0].delivered = false;
  engine.getDeliveredContent()[0].delivered = false;
  assert.equal(engine.getScheduledContent()[0].deliverAt, 4000);
  assert.deepEqual(engine.deliverDueContent(), []);
  engine.restart();
  engine.loadState({ currentSceneId: "start", history: [], variables: {} });
});

test("all read queries leave state and sampling unchanged and inspect other scenes", () => {
  const { engine, samples } = setup([definition({ conditions: [] })]);
  const before = engine.getState();
  assert.equal(engine.getScene("other").id, "other");
  assert.deepEqual(engine.getAvailableChoices("other").map((item) => item.id), ["disable"]);
  assert.equal(engine.getScene("start").choices.length, 3);
  assert.equal(engine.getAvailableChoices("start").length, 2);
  engine.getScene("start").choices.pop();
  engine.getAvailableChoices("start")[0].effects[0].value = false;
  engine.getCurrentScene(); engine.getCurrentSceneView();
  engine.getScheduledContent(); engine.getPendingContent(); engine.getDueContent();
  engine.getDeliveredContent(); engine.getNextDeliveryTime();
  assert.throws(() => engine.getScene("missing"), /Scene not found/);
  assert.throws(() => engine.getAvailableChoices("missing"), /Scene not found/);
  assert.deepEqual(engine.getState(), before);
  assert.equal(samples(), 0);
  engine.choose("enable");
  assert.equal(engine.getState().variables.ready, true);
});

test("failed effects do not reconcile or retain partial engine state", () => {
  const { engine, samples } = setup();
  const before = engine.getState();
  assert.throws(() => engine.choose("fail"), /Unhandled custom effect/);
  assert.deepEqual(engine.getState(), before);
  assert.equal(samples(), 0);
});

test("shared evaluator preserves strict equality and numeric coercion", () => {
  for (const [operator, current, value, expected] of [
    ["===", "2", 2, false], ["!==", "2", 2, true], [">", "3", 2, true],
    [">=", true, 1, true], ["<", false, 1, true], ["<=", "2", 2, true],
    [">", undefined, 0, false], ["!==", undefined, false, true], ["===", undefined, false, false],
  ]) {
    assert.equal(evaluateConditions([{ variable: "x", operator, value }], current === undefined ? {} : { x: current }), expected);
  }
  assert.equal(evaluateConditions(undefined, {}), true);
  assert.equal(evaluateConditions([], {}), true);
  assert.equal(evaluateConditions([condition, { ...condition, value: false }], { ready: true }), false);
});

for (const [field, value] of [
  ["deliverAt", NaN], ["deliverAt", Infinity], ["deliverAt", -1], ["deliverAt", "1000"],
  ["deliverAt", Number.MAX_SAFE_INTEGER + 1], ["delivered", 1], ["notify", undefined], ["id", ""], ["sourceId", null],
]) {
  test(`malformed loaded ${field}=${String(value)} is rejected atomically`, () => {
    const { engine } = setup();
    engine.choose("enable");
    const before = engine.getState();
    const invalid = engine.getState();
    invalid.scheduledContent[0][field] = value;
    assert.throws(() => engine.loadState(invalid), new RegExp(`Content .*${field}`));
    assert.deepEqual(engine.getState(), before);
  });
}

test("duplicate and malformed schedule containers reject before replacing state", () => {
  const { engine } = setup();
  engine.choose("enable");
  const before = engine.getState();
  for (const scheduledContent of [null, {}, [null], [...before.scheduledContent, ...before.scheduledContent]]) {
    assert.throws(() => engine.loadState({ ...before, scheduledContent }));
    assert.deepEqual(engine.getState(), before);
  }
});

for (const delivery of [
  { type: "later" }, { type: "delayed", minDelaySeconds: -1, maxDelaySeconds: 2 },
  { type: "delayed", minDelaySeconds: 3, maxDelaySeconds: 2 },
  { type: "delayed", minDelaySeconds: 0, maxDelaySeconds: Infinity },
  { type: "delayed", minDelaySeconds: 0, maxDelaySeconds: 2, notify: "yes" },
  { type: "delayed", minDelaySeconds: "1", maxDelaySeconds: 2 },
  { type: "immediate", minDelaySeconds: 1 }, null,
]) {
  test(`reject invalid delivery ${JSON.stringify(delivery)}`, () => {
    assert.throws(() => setup([definition({ delivery })]), /Content source\/item.delivery/);
  });
}

test("invalid definitions and injected values are rejected", () => {
  assert.throws(() => setup([definition(), definition()]), /duplicate scheduling identity/);
  assert.throws(() => setup([definition({ conditions: [{ variable: "x", operator: "==", value: 1 }] })]), /Content source\/item.conditions\[0\].operator/);
  for (const random of [() => -1, () => 1, () => NaN, () => Infinity, () => "0.5"]) {
    const engine = new DecisionEngine(story(), { scheduledContent: [definition({ conditions: [] })], random });
    assert.throws(() => engine.scheduleContent(), /random sample/);
    assert.deepEqual(engine.getScheduledContent(), []);
  }
  for (const clock of [() => -1, () => Infinity, () => NaN]) {
    const engine = new DecisionEngine(story(), { scheduledContent: [definition({ conditions: [] })], clock });
    assert.throws(() => engine.scheduleContent(), /clock timestamp/);
  }
});

test("zero and fixed delays and minimum sample boundary", () => {
  for (const [min, max, sample, expected] of [[0, 0, 0.5, 1000], [2, 2, 0.5, 3000], [2, 4, 0, 3000], [2, 4, 0.999, 4998]]) {
    const engine = new DecisionEngine(story(), { scheduledContent: [definition({ conditions: [], delivery: { type: "delayed", minDelaySeconds: min, maxDelaySeconds: max } })], clock: () => 1000, random: () => sample });
    assert.equal(engine.scheduleContent()[0].deliverAt, expected);
  }
});

test("restored ineligible schedules keep their original flags and notification hints", () => {
  const { engine, samples } = setup();
  engine.loadState({ currentSceneId: "start", history: [], variables: {}, scheduledContent: [
    { id: "item", sourceId: "source", deliverAt: 0, delivered: true, notify: false },
  ] });
  engine.choose("enable");
  assert.equal(samples(), 0);
  assert.deepEqual(engine.getDeliveredContent(), [{ id: "item", sourceId: "source", deliverAt: 0, delivered: true, notify: false }]);
  assert.deepEqual(engine.deliverDueContent(), []);
});

test("failed reconciliation during load leaves the old timeline intact", () => {
  const engine = new DecisionEngine(story(), {
    scheduledContent: [definition()], clock: () => Number.MAX_SAFE_INTEGER, random: () => 0.5,
  });
  const before = engine.getState();
  assert.throws(() => engine.loadState({ currentSceneId: "other", history: ["start"], variables: { ready: true } }), /Content source\/item.deliverAt/);
  assert.deepEqual(engine.getState(), before);
});

test("new schedule return values cannot mutate persisted records", () => {
  const { engine } = setup([definition({ conditions: [] })]);
  const added = engine.scheduleContent();
  added[0].delivered = true;
  added[0].notify = false;
  added[0].deliverAt = 0;
  added.pop();
  assert.deepEqual(engine.getScheduledContent(), [{ id: "item", sourceId: "source", deliverAt: 4000, delivered: false, notify: true }]);
});
