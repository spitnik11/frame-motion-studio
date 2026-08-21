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
  transparent?: boolean; // cut out background -> RGBA PNG (finishing done in-graph, not via Studio Photo API)
  poseIsMap?: boolean; // true = input is already an OpenPose skeleton (preset) -> skip preprocessor
  initImageName?: string; // img2img identity keyframe: seed the latent from this frame (locks identity)
  denoise?: number; // with initImageName, how much to change (0.5-0.6 keeps identity, moves pose)
  promptSuffix?: string; // appended to basePrompt (e.g. directional "back view" for turnarounds)
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

  const positive = anchor.basePrompt + (o.promptSuffix ? `, ${o.promptSuffix}` : "");
  g["6"] = { class_type: "CLIPTextEncode", inputs: { text: positive, clip: clipRef } };
  g["7"] = { class_type: "CLIPTextEncode", inputs: { text: anchor.negativePrompt, clip: clipRef } };

  g["11"] = { class_type: "LoadImage", inputs: { image: o.poseImageName } };
  // Preset pose maps are already OpenPose skeletons -> feed ControlNet directly. A photo/
  // reference pose needs the preprocessor to extract the skeleton first.
  let controlImage: [string, number] = ["11", 0];
  if (!o.poseIsMap) {
    g["12"] = {
      class_type: "OpenposePreprocessor",
      inputs: { image: ["11", 0], detect_hand: "enable", detect_body: "enable", detect_face: "enable", resolution: 512 },
    };
    controlImage = ["12", 0];
  }
  g["13"] = { class_type: "ControlNetLoader", inputs: { control_net_name: config.controlNetOpenpose } };
  g["14"] = {
    class_type: "ControlNetApplyAdvanced",
    inputs: {
      positive: ["6", 0],
      negative: ["7", 0],
      control_net: ["13", 0],
      image: controlImage,
      strength: control,
      start_percent: 0,
      end_percent: 1,
    },
  };

  // Latent source: empty (txt2img keyframe) or the identity keyframe encoded (img2img).
  let latentRef: [string, number] = ["5", 0];
  let denoise = 1;
  if (o.initImageName) {
    g["19"] = { class_type: "LoadImage", inputs: { image: o.initImageName } };
    g["20"] = { class_type: "VAEEncode", inputs: { pixels: ["19", 0], vae: ["4", 2] } };
    latentRef = ["20", 0];
    denoise = o.denoise ?? 0.55;
  } else {
    g["5"] = { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } };
  }
  g["3"] = {
    class_type: "KSampler",
    inputs: {
      model: modelRef,
      positive: ["14", 0],
      negative: ["14", 1],
      latent_image: latentRef,
      seed: o.seed,
      steps,
      cfg,
      sampler_name: sampler,
      scheduler,
      denoise,
    },
  };
  g["8"] = { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } };

  // Transparency finishing (design doc §16): remove background in-graph and save RGBA.
  // RemBgUltra -> (image, mask); JoinImageWithAlpha applies the mask as alpha.
  let saveSource: [string, number] = ["8", 0];
  if (o.transparent) {
    g["16"] = {
      class_type: "LayerMask: RemBgUltra",
      inputs: { image: ["8", 0], detail_range: 8, black_point: 0.01, white_point: 0.99, process_detail: true },
    };
    // RemBgUltra's mask is background-white / subject-black; JoinImageWithAlpha needs the
    // opposite, so invert it — otherwise the character (not the background) goes transparent.
    g["18"] = { class_type: "InvertMask", inputs: { mask: ["16", 1] } };
    g["17"] = { class_type: "JoinImageWithAlpha", inputs: { image: ["16", 0], alpha: ["18", 0] } };
    saveSource = ["17", 0];
  }

  g["9"] = { class_type: "SaveImage", inputs: { images: saveSource, filename_prefix: "fms/frame" } };
  return g;
}
