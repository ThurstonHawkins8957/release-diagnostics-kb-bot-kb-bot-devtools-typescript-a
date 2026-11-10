import assert from "node:assert/strict";
import test from "node:test";
import { ReleaseKnowledgeService } from "../src/release_knowledge.js";

test("sends a weakly supported diagnostic to maintainer review", async () => {
  const service = new ReleaseKnowledgeService({
    embed: async () => [0.1, 0.2],
    createCollection: async () => ({}),
    upsert: async () => ({}),
    query: async () => ({ matches: [{ id: "build-17", score: 0.8, metadata: { title: "Build 17", body: "Compiler cache was cleared.", event_type: "build", sensitivity: "internal" } }] }),
    rerank: async () => ({ results: [{ index: 0, score: 0.61 }] }),
  });

  const result = await service.diagnose("release-ops", "Why did the package promotion pause?");
  assert.deepEqual(result, { disposition: "maintainer_review", answer: null, sources: [] });
});

test("returns strongly supported release guidance with its source", async () => {
  const service = new ReleaseKnowledgeService({
    embed: async () => [0.1, 0.2],
    createCollection: async () => ({}),
    upsert: async () => ({}),
    query: async () => ({ matches: [{ id: "release-42", score: 0.9, metadata: { title: "Promotion pause", body: "Confirm the signed artifact digest, then resume promotion.", event_type: "release", sensitivity: "internal" } }] }),
    rerank: async () => ({ results: [{ index: 0, score: 0.91 }] }),
  });

  const result = await service.diagnose("release-ops", "Why did the package promotion pause?");
  assert.equal(result.disposition, "answer");
  assert.equal(result.sources[0].id, "release-42");
});
