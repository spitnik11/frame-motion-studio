import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPoseFrame } from "./workflow.js";
import { inferArchitecture, archMatch } from "./registry.js";
import type { Anchor } from "./anchors.js";

const anchor: Anchor = {
  id: "t", name: "t", architecture: "illustrious",
  checkpoint: "waiIllustriousSDXL_v110.safetensors",
  characterLora: "Emily.safetensors", styleLora: null,
  basePrompt: "a girl", negativePrompt: "bad",
  identityStrength: 0.9, styleStrength: 0.75,
};

test("architecture inference mirrors the four real families", () => {
  assert.equal(inferArchitecture("krea2TurboINT8.safetensors"), "krea2");
  assert.equal(inferArchitecture("nicegirls_Zimage.safetensors"), "z-image");
  assert.equal(inferArchitecture("waiANIMA_v10Base10.safetensors"), "anima");
  assert.equal(inferArchitecture("pixelArtDiffusionXL_spriteShaper.safetensors"), "illustrious");
  assert.equal(inferArchitecture("random_thing.safetensors"), "unknown");
});

test("compatibility gate: same family passes, cross-family and unknown are blocked", () => {
  const sdxl = inferArchitecture("waiIllustriousSDXL_v110.safetensors"); // illustrious
  assert.equal(archMatch(inferArchitecture("MoriiMee_Style_Illustrious_r1.safetensors"), sdxl), true);
  assert.equal(archMatch(inferArchitecture("nicegirls_Zimage.safetensors"), sdxl), false);
  assert.equal(archMatch("unknown", sdxl), false); // safe default: unclassified LoRA blocked
});

test("pose workflow wires controlnet between text-encode and sampler", () => {
  const g = buildPoseFrame(anchor, { poseImageName: "p.png", seed: 42 });
  assert.equal(g["3"].class_type, "KSampler");
  assert.deepEqual(g["3"].inputs.positive, ["14", 0]); // sampler reads controlnet-applied cond
  assert.deepEqual(g["3"].inputs.negative, ["14", 1]);
  assert.deepEqual(g["14"].inputs.image, ["12", 0]); // controlnet fed by openpose preprocessor
  assert.equal(g["12"].class_type, "OpenposePreprocessor");
  assert.deepEqual(g["3"].inputs.model, ["10", 0]); // model routed through character LoRA
  assert.equal(g["3"].inputs.seed, 42);
});
