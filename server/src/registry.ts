import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

// Read-only model/LoRA registry (Phase 3). Mirrors Z-Image Studio's REAL four
// architectures (z-image, krea2, illustrious, anima) + unknown. There is no `pony`
// adapter in the source system — SDXL-family checkpoints (illustrious/noobai/pony/
// autismmix/pixel-art) all use the SDXL checkpoint loader + SDXL ControlNet, so we
// group them under `illustrious`. Compatibility invariant: a LoRA may only load on a
// model of the SAME architecture. Never invent architecture from vague marketing.

export type Architecture = "illustrious" | "z-image" | "krea2" | "anima" | "unknown";

/** Pure keyword classifier (checkpoints, and LoRA-metadata fallback). */
export function inferArchitecture(text: string): Architecture {
  const t = text.toLowerCase();
  if (/krea[\s_-]?2|krea/.test(t)) return "krea2";
  if (/z[\s_-]?image|zimage/.test(t)) return "z-image";
  if (/anima/.test(t)) return "anima";
  // SDXL family -> illustrious adapter (shares SDXL checkpoint loader + SDXL controlnet).
  if (/illustrious|noobai|ixl|pony|autismmix|sdxl|_xl|pixelart|pixel[\s_-]?art|sprite/.test(t)) return "illustrious";
  return "unknown";
}

export function archMatch(a: Architecture, b: Architecture): boolean {
  return a === b && a !== "unknown";
}

/** Mirror of Z-Image Studio's readSafetensorsMetadata — parse the __metadata__ header. */
function readSafetensorsMetadata(file: string): Record<string, unknown> {
  try {
    const fd = fs.openSync(file, "r");
    const lenBuf = Buffer.alloc(8);
    fs.readSync(fd, lenBuf, 0, 8, 0);
    const headerLen = Number(lenBuf.readBigUInt64LE());
    if (!Number.isSafeInteger(headerLen) || headerLen < 2 || headerLen > 16 * 1024 * 1024) {
      fs.closeSync(fd);
      return {};
    }
    const header = Buffer.alloc(headerLen);
    fs.readSync(fd, header, 0, headerLen, 8);
    fs.closeSync(fd);
    return JSON.parse(header.toString("utf8")).__metadata__ ?? {};
  } catch {
    return {};
  }
}

// Only the base-model fields — NOT the whole metadata JSON. Scanning the full blob
// false-positives on training tags ("animal"/"animated" -> anima), which is exactly the
// "never invent architecture from vague marketing" failure.
const BASE_MODEL_KEYS = [
  "ss_base_model_version", "ss_base_model", "ss_sd_model_name",
  "ss_output_name", "modelspec.architecture", "modelspec.title",
];

function baseModelText(meta: Record<string, unknown>): string {
  return BASE_MODEL_KEYS.map((k) => meta[k]).filter((v): v is string => typeof v === "string").join(" ");
}

/** Filename keyword first (author-controlled); targeted base-model metadata second. */
export function resolveLoraArchitecture(filename: string): Architecture {
  const byName = inferArchitecture(filename);
  if (byName !== "unknown") return byName;
  const meta = readSafetensorsMetadata(path.join(config.paths.loras, filename));
  return inferArchitecture(baseModelText(meta));
}

function listDir(dir: string, exts: string[]) {
  try {
    return fs.readdirSync(dir).filter((f) => exts.some((e) => f.endsWith(e)));
  } catch {
    return [];
  }
}

export const listCheckpoints = () =>
  listDir(config.paths.checkpoints, [".safetensors", ".ckpt"]).map((filename) => ({
    filename,
    architecture: inferArchitecture(filename),
  }));

export const listLoras = () =>
  listDir(config.paths.loras, [".safetensors"]).map((filename) => ({
    filename,
    architecture: resolveLoraArchitecture(filename),
  }));

export const listControlnets = () => listDir(config.paths.controlnet, [".safetensors"]);

/** The compatibility gate — enforced before any frame is queued. */
export function loraCompatible(loraName: string, checkpointName: string): boolean {
  return archMatch(resolveLoraArchitecture(loraName), inferArchitecture(checkpointName));
}
