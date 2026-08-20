// PoseBundleImporter — the smallest integration for 3D Motion Studio (Phase 17).
//
// Reads a PoseBundle (plain files produced by 3D Motion Studio) with NO Blender and
// no coupling to 3D Motion Studio's code. A PoseBundle is a directory of per-frame
// control passes + JSON metadata; Frame Motion consumes it to drive FrameGenerator.
//
// This file is intentionally standalone and additive — it does not modify any existing
// Frame Motion behavior.

import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

export interface PoseBundleFrame {
  frame: number;
  dir: string;
  preview: string;
  passes: string;
  silhouette: string;
  masks: Record<number, string>;
  pose: unknown | null;
}

export interface PoseBundle {
  manifest: {
    schema: string;
    version: number;
    frames: number[];
    resolution: [number, number];
    actors: string[];
    actorIndices: Record<string, number>;
    passes: string[];
  };
  sidecars: Record<string, unknown>;
  frames: PoseBundleFrame[];
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

/** Load and validate a PoseBundle directory. Throws if malformed. */
export function readPoseBundle(bundleDir: string): PoseBundle {
  const manifestPath = join(bundleDir, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`no manifest.json in ${bundleDir}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  if (manifest.schema !== "posebundle") throw new Error(`not a posebundle: schema=${manifest.schema}`);
  if (manifest.version !== 1) throw new Error(`unsupported posebundle version ${manifest.version}`);

  const sidecars: Record<string, unknown> = {};
  for (const name of ["camera", "scene", "actors", "contacts"]) {
    const p = join(bundleDir, `${name}.json`);
    if (existsSync(p)) sidecars[name] = JSON.parse(readFileSync(p, "utf-8"));
  }

  const indices: number[] = Object.values(manifest.actorIndices ?? {});
  const frames: PoseBundleFrame[] = (manifest.frames as number[]).map((f) => {
    const dir = join(bundleDir, `frame_${pad4(f)}`);
    const posePath = join(dir, "pose.json");
    const masks: Record<number, string> = {};
    for (const idx of indices) masks[idx] = join(dir, `actor_${idx}_mask.png`);
    return {
      frame: f,
      dir,
      preview: join(dir, "preview.png"),
      passes: join(dir, "passes.exr"),
      silhouette: join(dir, "silhouette.png"),
      masks,
      pose: existsSync(posePath) ? JSON.parse(readFileSync(posePath, "utf-8")) : null,
    };
  });

  return { manifest, sidecars, frames };
}

/** True if every frame's required files exist and are non-empty. */
export function isPoseBundleComplete(bundle: PoseBundle): boolean {
  const ok = (p: string) => existsSync(p) && statSync(p).size > 0;
  return bundle.frames.every(
    (fr) =>
      ok(fr.preview) &&
      ok(fr.passes) &&
      ok(fr.silhouette) &&
      Object.values(fr.masks).every(ok),
  );
}
