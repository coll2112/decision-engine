import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import Ajv from "ajv";
import { DecisionEngine, parseStory } from "../../dist/index.js";

const require = createRequire(import.meta.url);
// Resolve the public package subpath, not an internal filesystem shortcut.
const schema = JSON.parse(readFileSync(require.resolve("@coll2112/decision-engine/story.schema.json"), "utf8"));
const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });
ajv.addSchema(schema, "story");
const validate = ajv.getSchema("story");
const validateDefinitions = ajv.getSchema("story#/definitions/scheduledContentDefinitions");
function story(choice = { id: "go", text: "Go", nextSceneId: "start" }) {
  return {
    $schema: "./node_modules/@coll2112/decision-engine/schema/story.schema.json",
    id: "schema", title: "Schema", startSceneId: "start",
    initialVariables: { seen: false, count: 0, label: "" },
    scenes: [{ id: "start", text: "Start", choices: [choice] }],
  };
}
function agree(value, expected) {
  assert.equal(validate(value), expected, JSON.stringify(validate.errors));
  if (expected) assert.doesNotThrow(() => parseStory(value));
  else assert.throws(() => parseStory(value));
}

test("exported asset is a valid editor schema", () => {
  assert.equal(ajv.validateSchema(schema), true);
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.ok(pkg.files.includes("schema/story.schema.json"));
});

for (const navigation of [
  { nextSceneId: "start" }, { navigation: "scene", nextSceneId: "start" }, { navigation: "stay" },
]) {
  test(`schema and runtime accept navigation ${JSON.stringify(navigation)}`, () => {
    agree(story({ id: "choose", text: "Choose", ...navigation }), true);
  });
}
for (const navigation of [
  {}, { navigation: "scene" }, { nextSceneId: "" }, { nextSceneId: " " },
  { nextSceneId: null }, { navigation: "stay", nextSceneId: "start" },
  { navigation: "stay", nextSceneId: null }, { navigation: "unknown", nextSceneId: "start" },
  { navigation: false, nextSceneId: "start" }, { navigation: null },
]) {
  test(`schema and runtime reject navigation ${JSON.stringify(navigation)}`, () => {
    const value = story({ id: "choose", text: "Choose", ...navigation });
    agree(value, false);
    assert.throws(() => parseStory(value), /Scene start choice choose\.(navigation|nextSceneId)/);
  });
}

test("runtime rejects an explicitly undefined target on stay choices", () => {
  assert.throws(() => parseStory(story({ id: "choose", text: "Choose", navigation: "stay", nextSceneId: undefined })), /nextSceneId conflicts/);
});

test("custom content, presentation data, hotspot props, and effect payloads stay extensible", () => {
  const value = story({ id: "stay", text: "Stay", navigation: "stay", effects: [{ type: "appAction", data: { arbitrary: [1, null, {}] } }] });
  value.scenes[0].content = { appField: { arbitrary: true } };
  value.scenes[0].presentation = {
    type: "custom", data: { arbitrary: [null, false] },
    background: { src: "image.png" },
    elements: [
      { type: "image", id: "image", asset: { src: "item.png" }, positionX: 0, width: 20 },
      { type: "hotspot", id: "hotspot", props: { appField: [1] } },
      { type: "light", id: "light", color: "red", intensity: 0.5, flicker: true },
    ],
    audio: [{ music: { id: "m", src: "music", loop: false }, ambience: [{ id: "a", src: "ambient", volume: 0 }], sfx: [{ id: "s", src: "sound", delayMs: 10 }] }],
  };
  value.sections = [{ id: "root", title: "Root", sceneIds: ["start"], assets: { image: { src: "image.png" } }, presentation: { data: [1, 2] } }];
  agree(value, true);
  for (const data of [null, false, 1, "", [], {}]) {
    value.scenes[0].content = data;
    value.scenes[0].presentation.data = data;
    agree(value, true);
  }
});

for (const mutate of [
  (v) => { v.initialVariables = null; },
  (v) => { v.initialVariables = { x: {} }; },
  (v) => { v.initialVariables = { x: null }; },
  (v) => { v.initialVariables = []; },
  (v) => { v.scenes[0].choices[0].conditions = [{ variable: "x", operator: "==", value: 1 }]; },
  (v) => { v.scenes[0].choices[0].conditions = [{ variable: "x", operator: "===", value: [] }]; },
  (v) => { v.scenes[0].choices[0].effects = [{ type: "custom", variable: "x" }]; },
  (v) => { v.scenes[0].choices[0].effects = [{ variable: "x", operation: "add", value: 1 }]; },
  (v) => { v.scenes[0].speaker = 1; },
  (v) => { v.scenes[0].presentation = null; },
  (v) => { v.scenes[0].presentation = { elements: [{ id: "x", type: "image" }] }; },
  (v) => { v.scenes[0].presentation = { elements: [{ id: "x", type: "light", intensity: "bright" }] }; },
  (v) => { v.scenes[0].presentation = { elements: [{ id: "x", type: "hotspot", props: [] }] }; },
  (v) => { v.scenes[0].presentation = { audio: [{ music: { id: "x", src: "x", loop: 1 } }] }; },
  (v) => { v.scenes[0].presentation = { audio: [{ sfx: [{ id: "x", src: "x", delayMs: "later" }] }] }; },
  (v) => { v.sections = [{ id: "root", assets: { bad: {} } }]; },
  (v) => { v.sections = [{ id: "root", title: 1 }]; },
  (v) => { v.$schema = 1; },
]) {
  const value = story();
  mutate(value);
  test(`schema/runtime reject malformed structure: ${JSON.stringify(value)}`, () => agree(value, false));
}

for (const [delivery, expected] of [
  [undefined, true], [{ type: "immediate" }, true],
  [{ type: "delayed", minDelaySeconds: 0, maxDelaySeconds: 0, notify: false }, true],
  [{ type: "delayed", minDelaySeconds: 0.5, maxDelaySeconds: 2, notify: true }, true],
  [null, false], [{ type: "unknown" }, false],
  [{ type: "immediate", notify: true }, false],
  [{ type: "delayed", minDelaySeconds: 1 }, false],
  [{ type: "delayed", minDelaySeconds: -1, maxDelaySeconds: 2 }, false],
  [{ type: "delayed", minDelaySeconds: 0, maxDelaySeconds: 1e20 }, false],
  [{ type: "delayed", minDelaySeconds: 0, maxDelaySeconds: 2, notify: "yes" }, false],
]) {
  test(`delivery fragment agrees with engine: ${JSON.stringify(delivery)}`, () => {
    const definitions = [{ id: "item", sourceId: "source", ...(delivery === undefined ? {} : { delivery }) }];
    assert.equal(validateDefinitions(definitions), expected, JSON.stringify(validateDefinitions.errors));
    const construct = () => new DecisionEngine(story(), { scheduledContent: definitions });
    if (expected) assert.doesNotThrow(construct);
    else assert.throws(construct);
  });
}

test("runtime retains semantic checks beyond portable JSON Schema", () => {
  const missing = story({ id: "go", text: "Go", nextSceneId: "missing" });
  assert.equal(validate(missing), true);
  assert.throws(() => parseStory(missing), /missing scene/);
  const duplicate = story();
  duplicate.scenes[0].choices.push({ ...duplicate.scenes[0].choices[0] });
  assert.equal(validate(duplicate), true);
  assert.throws(() => parseStory(duplicate), /duplicate/);
  const definitions = [{ id: "item", sourceId: "source", delivery: { type: "delayed", minDelaySeconds: 3, maxDelaySeconds: 2 } }];
  assert.equal(validateDefinitions(definitions), true);
  assert.throws(() => new DecisionEngine(story(), { scheduledContent: definitions }), /maxDelaySeconds must be/);
});
