import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { getAnchor } from "./anchors.js";
import { loraCompatible } from "./registry.js";
import { buildPoseFrame, type FrameOpts } from "./workflow.js";
import * as comfy from "./comfy.js";

// Frame generation (Phase 5): anchor + pose -> candidate frame, saved to disk with
// metadata. Accept/reject are independent per-frame (no neighbor regeneration).

export type Candidate = {
  id: string;
  anchorId: string;
  file: string; // relative to dataDir
  seed: number;
  meta: Record<string, any>;
};

function dataURLToBuffer(dataUrl: string): { buffer: Buffer; ext: string } {
  const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error("pose must be a base64 image data URL");
  return { buffer: Buffer.from(m[2], "base64"), ext: m[1] === "jpeg" ? "jpg" : m[1] };
}

export async function generateFrame(
  anchorId: string,
  poseDataUrl: string,
  opts: Partial<FrameOpts> = {}
): Promise<Candidate> {
  const anchor = getAnchor(anchorId);
  if (!anchor) throw new Error(`Unknown anchor ${anchorId}`);
  if (!anchor.checkpoint) throw new Error(`Anchor ${anchorId} has no checkpoint`);

  // Compatibility invariant — refuse cross-architecture LoRA before touching Comfy.
  for (const lora of [anchor.characterLora, anchor.styleLora].filter(Boolean) as string[]) {
    if (!loraCompatible(lora, anchor.checkpoint)) {
      throw new Error(`LoRA "${lora}" is not compatible with ${anchor.architecture} checkpoint "${anchor.checkpoint}"`);
    }
  }

  const { buffer, ext } = dataURLToBuffer(poseDataUrl);
  const id = `frame_${Date.now().toString(36)}`;
  const poseName = await comfy.uploadImage(`fms_pose_${id}.${ext}`, buffer);

  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const workflow = buildPoseFrame(anchor, { ...opts, poseImageName: poseName, seed });

  const promptId = await comfy.queue(workflow);
  const job = await comfy.waitForJob(promptId);
  const png = await comfy.fetchImage(job);

  const rel = path.join("outputs", "candidates", `${id}.png`);
  fs.writeFileSync(path.join(config.dataDir, rel), png);

  const meta = { anchor: anchor.id, checkpoint: anchor.checkpoint, characterLora: anchor.characterLora, seed, promptId };
  fs.writeFileSync(path.join(config.dataDir, "outputs", "candidates", `${id}.json`), JSON.stringify(meta, null, 2));
  return { id, anchorId, file: rel.replace(/\\/g, "/"), seed, meta };
}

export function acceptFrame(id: string): { accepted: string } {
  const from = path.join(config.dataDir, "outputs", "candidates", `${id}.png`);
  const to = path.join(config.dataDir, "outputs", "accepted", `${id}.png`);
  fs.copyFileSync(from, to);
  return { accepted: path.join("outputs", "accepted", `${id}.png`).replace(/\\/g, "/") };
}

export function rejectFrame(id: string): { rejected: string } {
  for (const ext of ["png", "json"]) {
    const p = path.join(config.dataDir, "outputs", "candidates", `${id}.${ext}`);
    if (fs.existsSync(p)) fs.rmSync(p);
  }
  return { rejected: id };
}
