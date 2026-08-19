import { config } from "./config.js";
import type { Anchor } from "./anchors.js";

// SDXL + OpenPose ControlNet frame graph (Phase 5), ComfyUI API format.
// Identity  = character LoRA + prompt + seed (IPAdapter not installed -> no raw
//             reference-image identity yet; that is a documented gap).
// Pose      = OpenPose ControlNet off the uploaded pose image (preprocessed in-graph).

export type FrameOpts = {
  poseImageName: string; // name returned by comfy uploadImage
  seed: number;
  steps?: number;
  cfg?: number;
  sampler?: string;
  scheduler?: string;
  width?: number;
  height?: number;
  controlStrength?: number; // pose lock
};

export function buildPoseFrame(anchor: Anchor, o: FrameOpts): Record<string, any> {
  const steps = o.steps ?? 28;
  const cfg = o.cfg ?? 4;
  const sampler = o.sampler ?? "dpmpp_sde";
  const scheduler = o.scheduler ?? "karras";
  const width = o.width ?? 768;
  const height = o.height ?? 768;
  const control = o.controlStrength ?? 0.9;

  const g: Record<string, any> = {};
  g["4"] = { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: anchor.checkpoint } };

  let modelRef: [string, number] = ["4", 0];
  let clipRef: [string, number] = ["4", 1];

  if (anchor.characterLora) {
    g["10"] = {
      class_type: "LoraLoader",
      inputs: {
        model: modelRef,
        clip: clipRef,
        lora_name: anchor.characterLora,
        strength_model: anchor.identityStrength,
        strength_clip: anchor.identityStrength,
      },
    };
    modelRef = ["10", 0];
    clipRef = ["10", 1];
  }
  if (anchor.styleLora) {
    g["15"] = {
      class_type: "LoraLoader",
      inputs: {
        model: modelRef,
        clip: clipRef,
        lora_name: anchor.styleLora,
        strength_model: anchor.styleStrength,
        strength_clip: anchor.styleStrength,
      },
    };
    modelRef = ["15", 0];
    clipRef = ["15", 1];
  }

  g["6"] = { class_type: "CLIPTextEncode", inputs: { text: anchor.basePrompt, clip: clipRef } };
  g["7"] = { class_type: "CLIPTextEncode", inputs: { text: anchor.negativePrompt, clip: clipRef } };

  g["11"] = { class_type: "LoadImage", inputs: { image: o.poseImageName } };
  g["12"] = {
    class_type: "OpenposePreprocessor",
    inputs: { image: ["11", 0], detect_hand: "enable", detect_body: "enable", detect_face: "enable", resolution: 512 },
  };
  g["13"] = { class_type: "ControlNetLoader", inputs: { control_net_name: config.controlNetOpenpose } };
  g["14"] = {
    class_type: "ControlNetApplyAdvanced",
    inputs: {
      positive: ["6", 0],
      negative: ["7", 0],
      control_net: ["13", 0],
      image: ["12", 0],
      strength: control,
      start_percent: 0,
      end_percent: 1,
    },
  };

  g["5"] = { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } };
  g["3"] = {
    class_type: "KSampler",
    inputs: {
      model: modelRef,
      positive: ["14", 0],
      negative: ["14", 1],
      latent_image: ["5", 0],
      seed: o.seed,
      steps,
      cfg,
      sampler_name: sampler,
      scheduler,
      denoise: 1,
    },
  };
  g["8"] = { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } };
  g["9"] = { class_type: "SaveImage", inputs: { images: ["8", 0], filename_prefix: "fms/frame" } };
  return g;
}
