import { config } from "./config.js";

// ComfyGateway (Phase 2): the ONLY thing that talks to ComfyUI. Normalizes errors,
// discovers capabilities, submits workflows, polls jobs, retrieves images.

export type HealthStatus = { online: boolean; detail: string };

const clientId = "frame-motion-studio";
let objectInfoCache: Record<string, any> | null = null;

async function comfy(pathname: string, init?: RequestInit) {
  const res = await fetch(`${config.comfyUrl}${pathname}`, init);
  if (!res.ok) throw new Error(`Comfy ${pathname} -> ${res.status} ${res.statusText}`);
  return res;
}

export async function health(): Promise<HealthStatus> {
  try {
    const res = await comfy("/system_stats");
    const j: any = await res.json();
    const dev = j?.devices?.[0]?.name ?? "unknown gpu";
    return { online: true, detail: `ComfyUI ${j?.system?.comfyui_version ?? "?"} · ${dev}` };
  } catch (e: any) {
    return { online: false, detail: e.message };
  }
}

export async function objectInfo(): Promise<Record<string, any>> {
  if (objectInfoCache) return objectInfoCache;
  const res = await comfy("/object_info");
  objectInfoCache = (await res.json()) as Record<string, any>;
  return objectInfoCache;
}

/** Which node classes exist — drives Motion Studio's capability map. */
export async function hasNodes(...classes: string[]): Promise<Record<string, boolean>> {
  const info = await objectInfo().catch(() => ({} as Record<string, any>));
  return Object.fromEntries(classes.map((c) => [c, c in info]));
}

/** Upload a PNG/JPG buffer to Comfy's input dir; returns the name to reference in LoadImage. */
export async function uploadImage(name: string, buffer: Buffer): Promise<string> {
  const form = new FormData();
  form.append("image", new Blob([buffer]), name);
  form.append("overwrite", "true");
  const res = await comfy("/upload/image", { method: "POST", body: form });
  const j: any = await res.json();
  return j.subfolder ? `${j.subfolder}/${j.name}` : j.name;
}

export async function queue(prompt: Record<string, any>): Promise<string> {
  const res = await comfy("/prompt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, client_id: clientId }),
  });
  const j: any = await res.json();
  if (j.error) throw new Error(`Comfy rejected workflow: ${JSON.stringify(j.error)}`);
  return j.prompt_id as string;
}

export type JobResult = { filename: string; subfolder: string; type: string };

/** Poll /history until the job produces images (or errors). */
export async function waitForJob(promptId: string, timeoutMs = 180_000): Promise<JobResult> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await comfy(`/history/${promptId}`);
    const hist: any = await res.json();
    const entry = hist[promptId];
    if (entry) {
      const status = entry.status?.status_str;
      if (status === "error") throw new Error(`Job failed: ${JSON.stringify(entry.status?.messages ?? entry.status)}`);
      for (const nodeOut of Object.values<any>(entry.outputs ?? {})) {
        const img = nodeOut.images?.[0];
        if (img) return { filename: img.filename, subfolder: img.subfolder ?? "", type: img.type ?? "output" };
      }
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error(`Job ${promptId} timed out after ${timeoutMs}ms`);
}

export async function fetchImage(job: JobResult): Promise<Buffer> {
  const qs = new URLSearchParams({ filename: job.filename, subfolder: job.subfolder, type: job.type });
  const res = await comfy(`/view?${qs.toString()}`);
  return Buffer.from(await res.arrayBuffer());
}
