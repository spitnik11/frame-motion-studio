import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

// Character Anchor (Phase 4): an approved character appearance, persisted as JSON in
// Motion Studio's own data dir. Source reference images are never modified.

export type Anchor = {
  id: string;
  name: string;
  architecture: string;
  checkpoint: string;
  characterLora: string | null;
  styleLora: string | null;
  basePrompt: string;
  negativePrompt: string;
  identityStrength: number; // -> character LoRA strength
  styleStrength: number; // -> style LoRA strength
};

const dir = () => path.join(config.dataDir, "anchors");

export function listAnchors(): Anchor[] {
  return fs
    .readdirSync(dir())
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir(), f), "utf8")));
}

export function getAnchor(id: string): Anchor | undefined {
  const p = path.join(dir(), `${id}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : undefined;
}

export function saveAnchor(input: Partial<Anchor>): Anchor {
  const id = input.id || `character_${Date.now().toString(36)}`;
  const anchor: Anchor = {
    id,
    name: input.name || id,
    architecture: input.architecture || "illustrious",
    checkpoint: input.checkpoint || "",
    characterLora: input.characterLora ?? null,
    styleLora: input.styleLora ?? null,
    basePrompt: input.basePrompt || "",
    negativePrompt: input.negativePrompt || "",
    identityStrength: input.identityStrength ?? 0.9,
    styleStrength: input.styleStrength ?? 0.75,
  };
  fs.writeFileSync(path.join(dir(), `${id}.json`), JSON.stringify(anchor, null, 2));
  return anchor;
}
