import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readJson(rel: string) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
}

const app = readJson("config/app.json");
const models = readJson("config/models.local.json");

export const config = {
  root,
  port: Number(process.env.PORT ?? app.port ?? 3200),
  comfyUrl: (process.env.COMFY_URL ?? app.comfyUrl ?? "http://127.0.0.1:8188").replace(/\/$/, ""),
  controlNetOpenpose: app.controlNetOpenpose as string,
  pythonPath: path.resolve(root, process.env.FMS_PYTHON ?? app.pythonPath ?? "python"),
  dataDir: path.resolve(root, app.dataDir ?? "./data"),
  paths: {
    checkpoints: models.checkpoints as string,
    loras: models.loras as string,
    controlnet: models.controlnet as string,
  },
};

// Ensure our own data dirs exist (never touches shared stores).
for (const d of ["anchors", "outputs/candidates", "outputs/accepted", "poses"]) {
  fs.mkdirSync(path.join(config.dataDir, d), { recursive: true });
}
