// Phase 17 gate: Frame Motion loads a PoseBundle while Blender is closed.
// node --test never touches Blender, so a successful load here proves the point.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPoseBundle, isPoseBundleComplete } from "./posebundle-importer.ts";

function writeFakeBundle(): string {
  const root = mkdtempSync(join(tmpdir(), "pb-"));
  const manifest = {
    schema: "posebundle",
    version: 1,
    frames: [1, 2],
    resolution: [128, 128],
    actors: ["A", "B"],
    actorIndices: { A: 1, B: 2 },
    passes: ["preview", "depth", "normal", "silhouette", "masks", "pose"],
  };
  writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest));
  for (const s of ["camera", "scene", "actors", "contacts"]) {
    writeFileSync(join(root, `${s}.json`), JSON.stringify(s === "contacts" ? [] : {}));
  }
  for (const f of [1, 2]) {
    const dir = join(root, `frame_${String(f).padStart(4, "0")}`);
    mkdirSync(dir);
    for (const fn of ["preview.png", "passes.exr", "silhouette.png", "actor_1_mask.png", "actor_2_mask.png"]) {
      writeFileSync(join(dir, fn), "x"); // non-empty placeholder
    }
    writeFileSync(join(dir, "pose.json"), JSON.stringify({ frame: f, actors: { A: {}, B: {} } }));
  }
  return root;
}

test("loads a PoseBundle without Blender", () => {
  const bundle = readPoseBundle(writeFakeBundle());
  assert.equal(bundle.manifest.schema, "posebundle");
  assert.equal(bundle.frames.length, 2);
  assert.equal(bundle.frames[0].frame, 1);
  assert.deepEqual(Object.keys(bundle.frames[0].masks), ["1", "2"]);
  assert.ok(bundle.frames[1].pose);
  assert.ok(isPoseBundleComplete(bundle));
});

test("rejects a non-posebundle directory", () => {
  const root = mkdtempSync(join(tmpdir(), "pb-bad-"));
  writeFileSync(join(root, "manifest.json"), JSON.stringify({ schema: "nope", version: 1 }));
  assert.throws(() => readPoseBundle(root), /not a posebundle/);
});
