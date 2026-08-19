import express from "express";
import path from "node:path";
import { config } from "./config.js";
import * as comfy from "./comfy.js";
import { listCheckpoints, listLoras, listControlnets } from "./registry.js";
import { listAnchors, getAnchor, saveAnchor } from "./anchors.js";
import { generateFrame, acceptFrame, rejectFrame } from "./frames.js";

const app = express();
app.use(express.json({ limit: "30mb" }));

const wrap = (fn: express.RequestHandler): express.RequestHandler => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((e) => res.status(500).json({ error: String(e?.message ?? e) }));

app.get("/api/diagnostics", wrap(async (_req, res) => {
  const caps = await comfy.hasNodes(
    "OpenposePreprocessor", "DWPreprocessor", "ControlNetApplyAdvanced",
    "RIFE VFI", "LayerMask: RemBgUltra", "VHS_VideoCombine"
  );
  res.json({
    studio: "ok",
    port: config.port,
    comfy: await comfy.health(),
    capabilities: {
      pose: caps.OpenposePreprocessor || caps.DWPreprocessor,
      controlnet: caps.ControlNetApplyAdvanced,
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

// Serve generated frames + the built frontend.
app.use("/data", express.static(config.dataDir));
app.use("/", express.static(path.join(config.root, "app/frontend/dist")));

app.listen(config.port, () => {
  console.log(`Frame Motion Studio on http://127.0.0.1:${config.port}  (Comfy ${config.comfyUrl})`);
});
