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
