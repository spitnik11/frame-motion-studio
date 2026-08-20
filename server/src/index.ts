import express from "express";
import path from "node:path";
import { config } from "./config.js";
import * as comfy from "./comfy.js";
import { listCheckpoints, listLoras, listControlnets } from "./registry.js";
import { listAnchors, getAnchor, saveAnchor } from "./anchors.js";
import { generateFrame, acceptFrame, rejectFrame } from "./frames.js";
import fs from "node:fs";
import {
  listAnimations, getAnimation, createAnimation, generateAnimationFrame,
  generateAllFrames, setFrameStatus, exportAnimation,
} from "./animations.js";

const app = express();
app.use(express.json({ limit: "30mb" }));

const wrap = (fn: express.RequestHandler): express.RequestHandler => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((e) => res.status(500).json({ error: String(e?.message ?? e) }));

app.get("/api/diagnostics", wrap(async (_req, res) => {
  const caps = await comfy.hasNodes(
    "OpenposePreprocessor", "DWPreprocessor", "ControlNetApplyAdvanced",
    "DepthAnythingV2Preprocessor", "IPAdapterAdvanced",
    "RIFE VFI", "LayerMask: RemBgUltra", "VHS_VideoCombine"
  );
  // Capability-driven UI reads this — the frontend renders controls off these flags,
  // never off node names. identityReference is false (IPAdapter absent; identity = LoRA
  // + prompt + seed). See docs/frontend-design.md §23 and docs/roadmap.md.
  res.json({
    studio: "ok",
    port: config.port,
    comfy: await comfy.health(),
    capabilities: {
      pose: caps.OpenposePreprocessor || caps.DWPreprocessor,
      controlnet: caps.ControlNetApplyAdvanced,
      depth: caps.DepthAnythingV2Preprocessor,
      identityReference: caps.IPAdapterAdvanced,
      interpolation: caps["RIFE VFI"],
      transparent: caps["LayerMask: RemBgUltra"],
      video: caps.VHS_VideoCombine,
    },
    nodes: caps,
  });
}));

app.get("/api/models", wrap(async (_req, res) =>
  res.json({ checkpoints: listCheckpoints(), controlnets: listControlnets() })));

app.get("/api/loras", wrap(async (_req, res) => res.json({ loras: listLoras() })));

app.get("/api/anchors", wrap(async (_req, res) => res.json({ anchors: listAnchors() })));
app.get("/api/anchors/:id", wrap(async (req, res) => {
  const a = getAnchor(req.params.id);
  return a ? res.json(a) : res.status(404).json({ error: "not found" });
}));
app.post("/api/anchors", wrap(async (req, res) => res.json(saveAnchor(req.body))));

app.post("/api/frames", wrap(async (req, res) => {
  const { anchorId, pose, opts } = req.body ?? {};
  if (!anchorId || !pose) return res.status(400).json({ error: "anchorId and pose (data URL) required" });
  res.json(await generateFrame(anchorId, pose, opts ?? {}));
}));
app.post("/api/frames/:id/accept", wrap(async (req, res) => res.json(acceptFrame(req.params.id))));
app.post("/api/frames/:id/reject", wrap(async (req, res) => res.json(rejectFrame(req.params.id))));

// --- Presets & animations (M1) ---
app.get("/api/presets", wrap(async (_req, res) => {
  const root = path.join(config.root, "motion", "presets");
  const presets = fs.existsSync(root)
    ? fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, "manifest.json")))
        .map((d) => JSON.parse(fs.readFileSync(path.join(root, d, "manifest.json"), "utf8")))
    : [];
  res.json({ presets });
}));

app.get("/api/animations", wrap(async (_req, res) => res.json({ animations: listAnimations() })));
app.get("/api/animations/:id", wrap(async (req, res) => {
  const a = getAnimation(req.params.id);
  return a ? res.json(a) : res.status(404).json({ error: "not found" });
}));
app.post("/api/animations", wrap(async (req, res) => {
  const { anchorId, presetId, transparent } = req.body ?? {};
  if (!anchorId || !presetId) return res.status(400).json({ error: "anchorId and presetId required" });
  res.json(createAnimation(anchorId, presetId, { transparent }));
}));
// Fire-and-forget: kick off sequential generation, return immediately; UI polls GET /:id.
app.post("/api/animations/:id/generate", wrap(async (req, res) => {
  const project = getAnimation(req.params.id);
  if (!project) return res.status(404).json({ error: "not found" });
  generateAllFrames(req.params.id).catch((e) => console.error("generateAll:", e.message));
  res.json({ started: true, id: req.params.id, frames: project.frames.length });
}));
app.post("/api/animations/:id/frames/:index/generate", wrap(async (req, res) =>
  res.json(await generateAnimationFrame(req.params.id, Number(req.params.index), { seed: req.body?.seed, denoise: req.body?.denoise }))));
app.post("/api/animations/:id/frames/:index/accept", wrap(async (req, res) =>
  res.json(setFrameStatus(req.params.id, Number(req.params.index), "accepted"))));
app.post("/api/animations/:id/export", wrap(async (req, res) =>
  res.json(await exportAnimation(req.params.id, req.body?.format ?? "sprite-sheet", { cols: req.body?.cols, cellHeight: req.body?.cellHeight }))));

// Serve preset skeleton maps for UI previews.
app.use("/presets", express.static(path.join(config.root, "motion", "presets")));

// Serve generated frames + the built frontend.
app.use("/data", express.static(config.dataDir));
app.use("/", express.static(path.join(config.root, "app/frontend/dist")));

app.listen(config.port, () => {
  console.log(`Frame Motion Studio on http://127.0.0.1:${config.port}  (Comfy ${config.comfyUrl})`);
});
