import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";
import { getAnchor } from "./anchors.js";
import { loraCompatible } from "./registry.js";
import { buildPoseFrame } from "./workflow.js";
import * as comfy from "./comfy.js";

const execFileP = promisify(execFile);

// Animation project (B8) + sequence generation (B9). Every frame keeps the ORIGINAL anchor
// as identity reference; frames are independent (regenerating one never touches neighbors).
// Consistency trick: all frames share the project baseSeed — only the pose varies — so the
// character stays identical across an idle. Regenerate rolls a fresh seed for that frame only.

export type FrameStatus = "empty" | "generating" | "review" | "accepted" | "failed";
export type AnimFrame = {
  index: number;
  pose: string; // preset pose file name
  status: FrameStatus;
  seed: number | null;
  image: string | null; // relative to dataDir
  promptId?: string;
};
export type AnimationProject = {
  id: string;
  character: string; // anchor id
  animation: string; // preset id
  fps: number;
  loop: boolean;
  transparent: boolean;
  baseSeed: number;
  frames: AnimFrame[];
};

const projDir = (id: string) => path.join(config.dataDir, "animations", id);
const presetDir = (preset: string) => path.join(config.root, "motion", "presets", preset);

function readManifest(id: string): AnimationProject {
  return JSON.parse(fs.readFileSync(path.join(projDir(id), "manifest.json"), "utf8"));
}
function writeManifest(p: AnimationProject) {
  fs.mkdirSync(projDir(p.id), { recursive: true });
  fs.writeFileSync(path.join(projDir(p.id), "manifest.json"), JSON.stringify(p, null, 2));
}

export function listAnimations(): AnimationProject[] {
  const root = path.join(config.dataDir, "animations");
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, "manifest.json"))).map(readManifest);
}
export const getAnimation = (id: string) => (fs.existsSync(path.join(projDir(id), "manifest.json")) ? readManifest(id) : undefined);

export function createAnimation(anchorId: string, presetId: string, opts: { transparent?: boolean } = {}): AnimationProject {
  const anchor = getAnchor(anchorId);
  if (!anchor) throw new Error(`Unknown anchor ${anchorId}`);
  if (!anchor.checkpoint) throw new Error(`Anchor ${anchorId} has no checkpoint`);
  for (const lora of [anchor.characterLora, anchor.styleLora].filter(Boolean) as string[]) {
    if (!loraCompatible(lora, anchor.checkpoint))
      throw new Error(`LoRA "${lora}" incompatible with ${anchor.architecture} checkpoint`);
  }
  const preset = JSON.parse(fs.readFileSync(path.join(presetDir(presetId), "manifest.json"), "utf8"));
  const id = `${presetId}_${Date.now().toString(36)}`;
  const project: AnimationProject = {
    id,
    character: anchorId,
    animation: presetId,
    fps: preset.fps ?? 8,
    loop: preset.loop ?? true,
    transparent: opts.transparent ?? true,
    baseSeed: Math.floor(Math.random() * 2 ** 31),
    frames: preset.poses.map((pose: string, index: number) => ({ index, pose, status: "empty", seed: null, image: null })),
  };
  fs.mkdirSync(path.join(projDir(id), "frames"), { recursive: true });
  writeManifest(project);
  return project;
}

/**
 * Generate one frame. Default seed = baseSeed (identity lock); pass a seed to reroll.
 * Frame 0 is the identity keyframe (txt2img). Every other frame img2img-inits from frame 0's
 * image so identity is locked while the pose moves — non-recursive, so no drift accumulates.
 */
export async function generateAnimationFrame(
  projectId: string,
  index: number,
  opts: { seed?: number; denoise?: number } = {}
): Promise<AnimFrame> {
  const project = getAnimation(projectId);
  if (!project) throw new Error(`Unknown animation ${projectId}`);
  const frame = project.frames[index];
  if (!frame) throw new Error(`Frame ${index} out of range`);
  const anchor = getAnchor(project.character)!;

  const poseBuf = fs.readFileSync(path.join(presetDir(project.animation), frame.pose));
  const poseName = await comfy.uploadImage(`fms_${projectId}_${index}.png`, poseBuf);

  // Init non-keyframe frames from the frame-0 keyframe (identity anchor).
  let initImageName: string | undefined;
  const keyframe = project.frames[0];
  if (index > 0 && keyframe.image) {
    const kfBuf = fs.readFileSync(path.join(config.dataDir, keyframe.image));
    initImageName = await comfy.uploadImage(`fms_${projectId}_kf.png`, kfBuf);
  }

  const useSeed = opts.seed ?? project.baseSeed;
  const workflow = buildPoseFrame(anchor, {
    poseImageName: poseName,
    seed: useSeed,
    poseIsMap: true,
    transparent: project.transparent,
    width: 768,
    height: 768,
    initImageName,
    denoise: opts.denoise,
  });

  frame.status = "generating";
  writeManifest(project);
  try {
    const promptId = await comfy.queue(workflow);
    const job = await comfy.waitForJob(promptId);
    const png = await comfy.fetchImage(job);
    const rel = path.join("animations", projectId, "frames", `${index}.png`);
    fs.writeFileSync(path.join(config.dataDir, rel), png);
    Object.assign(frame, { status: "review", seed: useSeed, image: rel.replace(/\\/g, "/"), promptId });
  } catch (e) {
    frame.status = "failed";
    writeManifest(project);
    throw e;
  }
  writeManifest(project);
  return frame;
}

/** Generate all empty/failed frames sequentially (12GB VRAM — no parallel batches). */
export async function generateAllFrames(projectId: string): Promise<AnimationProject> {
  const project = getAnimation(projectId);
  if (!project) throw new Error(`Unknown animation ${projectId}`);
  for (const f of project.frames) {
    if (f.status === "empty" || f.status === "failed") await generateAnimationFrame(projectId, f.index);
  }
  return getAnimation(projectId)!;
}

export function setFrameStatus(projectId: string, index: number, status: "accepted" | "review"): AnimFrame {
  const project = getAnimation(projectId)!;
  project.frames[index].status = status;
  writeManifest(project);
  return project.frames[index];
}

/**
 * Export the generated frames (in order). Formats:
 *  - "png-sequence": raw RGBA frames renamed frame_000.png…
 *  - "sprite-sheet":  uniform-grid RGBA sheet via ffmpeg (preview/quick use).
 *  - "godot-pixel":   HARDENED pixel-art sprites + Godot 4 SpriteFrames .tres + .import.
 *                     1-bit alpha, shared palette, feet-aligned uniform cells (motion/pixel_export.py).
 */
export async function exportAnimation(
  projectId: string,
  format: "png-sequence" | "sprite-sheet" | "godot-pixel",
  opts: { cols?: number; cellHeight?: number; colors?: number } = {}
) {
  const project = getAnimation(projectId)!;
  const usable = project.frames.filter((f) => f.image && (f.status === "accepted" || f.status === "review"));
  if (usable.length === 0) throw new Error("No generated frames to export");

  const exDir = path.join(projDir(projectId), "exports");
  const seqDir = path.join(exDir, "png");
  fs.rmSync(seqDir, { recursive: true, force: true });
  fs.mkdirSync(seqDir, { recursive: true });
  usable.forEach((f, i) => fs.copyFileSync(path.join(config.dataDir, f.image!), path.join(seqDir, `frame_${String(i).padStart(3, "0")}.png`)));

  if (format === "png-sequence") return { format, dir: path.relative(config.dataDir, seqDir).replace(/\\/g, "/"), frames: usable.length };

  const n = usable.length;
  const c = opts.cols ?? Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / c);

  if (format === "godot-pixel") {
    const gdir = path.join(exDir, "godot");
    fs.rmSync(gdir, { recursive: true, force: true });
    fs.mkdirSync(gdir, { recursive: true });
    const script = path.join(config.root, "motion", "pixel_export.py");
    const { stdout } = await execFileP(config.pythonPath, [
      script, seqDir, gdir, project.animation, String(project.fps),
      String(opts.cellHeight ?? 128), String(c), String(opts.colors ?? 32),
    ]);
    let verify: any = {};
    try { verify = JSON.parse(stdout.trim().split("\n").pop() || "{}"); } catch { /* keep raw */ }
    return {
      format, dir: path.relative(config.dataDir, gdir).replace(/\\/g, "/"),
      sheet: path.relative(config.dataDir, path.join(gdir, "spritesheet.png")).replace(/\\/g, "/"),
      tres: `${project.animation}.tres`, frames: n, verify,
    };
  }

  const sheet = path.join(exDir, "spritesheet.png");
  await execFileP("ffmpeg", [
    "-y", "-i", path.join(seqDir, "frame_%03d.png"),
    "-filter_complex", `tile=${c}x${rows}:padding=0`,
    "-frames:v", "1", "-pix_fmt", "rgba", sheet,
  ]);
  return { format, file: path.relative(config.dataDir, sheet).replace(/\\/g, "/"), cols: c, rows, frames: n };
}
