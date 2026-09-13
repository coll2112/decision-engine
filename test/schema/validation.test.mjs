import assert from "node:assert/strict";
import test from "node:test";
import {
  assertStory,
  choice,
  defineStory,
  parseStory,
  scene,
  section,
} from "../../dist/index.js";

const baseStory = () =>
  defineStory({
    id: "test-story",
    title: "Test Story",
    startSceneId: "start",
    sections: [
      section("root", ["start"], {
        title: "Root",
      }),
      section("child", ["next"], {
        parentSectionId: "root",
        title: "Child",
      }),
    ],
    scenes: [
      scene("start", "Start", [choice("Continue", "next")]),
      scene("next", "Next"),
    ],
  });

test("assertStory returns a valid story", () => {
  const story = baseStory();

  assert.equal(assertStory(story), story);
});

test("parseStory validates unknown story data", () => {
  const story = parseStory(baseStory());

  assert.equal(story.id, "test-story");
});

test("validateStory rejects missing parent sections", () => {
  const story = baseStory();
  story.sections[1] = {
    ...story.sections[1],
    parentSectionId: "missing",
  };

  assert.throws(
    () => assertStory(story),
    /points to missing parent section missing/,
  );
});

test("validateStory rejects circular section parents", () => {
  const story = baseStory();
  story.sections[0] = {
    ...story.sections[0],
    parentSectionId: "child",
  };

  assert.throws(() => assertStory(story), /has a circular parent chain/);
});

test("validateStory rejects duplicate scene membership", () => {
  const story = baseStory();
  story.sections.push(section("other", ["next"]));

  assert.throws(
    () => assertStory(story),
    /Scene next is assigned to more than one section/,
  );
});

test("parseStory passes custom content to an optional validator", () => {
  const seen = [];
  const story = parseStory(
    {
      id: "custom-content",
      title: "Custom Content",
      startSceneId: "start",
      scenes: [
        {
          id: "start",
          text: "Start",
          choices: [],
          content: {
            kind: "room",
          },
        },
      ],
    },
    {
      validateSceneContent(content, sceneId) {
        seen.push([sceneId, content.kind]);
      },
    },
  );

  assert.equal(story.scenes[0].content.kind, "room");
  assert.deepEqual(seen, [["start", "room"]]);
});

test("parseStory passes presentation data to an optional validator", () => {
  const seen = [];

  parseStory(
    {
      id: "presentation-data",
      title: "Presentation Data",
      startSceneId: "start",
      sections: [
        {
          id: "root",
          sceneIds: ["start"],
          presentation: {
            type: "chapter",
            data: { layout: "wide" },
          },
        },
      ],
      scenes: [
        {
          id: "start",
          text: "Start",
          choices: [],
          presentation: {
            type: "dialogue",
            data: { mood: "tense" },
          },
        },
      ],
    },
    {
      validatePresentationData(data, owner) {
        seen.push([owner.kind, owner.id, Object.keys(data)[0]]);
      },
    },
  );

  assert.deepEqual(seen, [
    ["scene", "start", "mood"],
    ["section", "root", "layout"],
  ]);
});

for (const [field, value, expected] of [
  ["conditions", {}, "conditions"],
  ["conditions", [null], "conditions\\[0\\]"],
  ["conditions", [{ variable: "", operator: "===", value: true }], "variable"],
  ["conditions", [{ variable: "x", operator: "==", value: true }], "operator"],
  ["conditions", [{ variable: "x", operator: "===", value: {} }], "value"],
  ["conditions", [{ variable: "x", operator: "===", value: NaN }], "value"],
  ["conditions", [{ variable: "x", operator: "===", value: true, op: "eq" }], "op"],
  ["effects", {}, "effects"],
  ["effects", [null], "effects\\[0\\]"],
  ["effects", [{ variable: "x", operation: "add", value: 1 }], "operation"],
  ["effects", [{ variable: "", operation: "set", value: 1 }], "variable"],
  ["effects", [{ variable: "x", operation: "set" }], "value"],
  ["effects", [{ variable: "x", operation: "set", value: Infinity }], "value"],
  ["effects", [{ type: "" }], "type"],
  ["effects", [{ type: "custom", variable: "x", operation: "set", value: 1 }], "variable"],
]) {
  test(`reject malformed ${field}: ${JSON.stringify(value)}`, () => {
    const story = baseStory();
    story.scenes[0].choices[0][field] = value;
    assert.throws(() => parseStory(story), new RegExp(`Scene start choice continue.*${expected}`));
  });
}

test("choice identities must be unique within each scene only", () => {
  const story = baseStory();
  story.scenes[1].choices.push({ ...story.scenes[0].choices[0] });
  assert.doesNotThrow(() => parseStory(story));
  story.scenes[0].choices.push({ ...story.scenes[0].choices[0] });
  assert.throws(() => parseStory(story), /Scene start choice continue.id is duplicate/);
});

test("valid canonical effects and conditions retain custom data hooks", () => {
  const story = baseStory();
  story.scenes[0].content = { kind: "custom" };
  story.scenes[0].choices[0].conditions = [{ variable: "x", operator: ">=", value: "2" }];
  story.scenes[0].choices[0].effects = [
    { variable: "x", operation: "increment", value: "1" },
    { variable: "x", operation: "decrement", value: true },
    { type: "custom", data: { any: ["payload"] } },
  ];
  let calls = 0;
  parseStory(story, { validateSceneContent: () => { calls++; } });
  assert.equal(calls, 1);
});

test("sparse condition and effect arrays are malformed", () => {
  for (const field of ["conditions", "effects"]) {
    const story = baseStory();
    story.scenes[0].choices[0][field] = new Array(1);
    assert.throws(() => parseStory(story), new RegExp(`Scene start choice continue.${field}\\[0\\]`));
  }
});
