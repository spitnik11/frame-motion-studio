import React, { useEffect, useState } from "react";

type Model = { filename: string; architecture: string };
type Anchor = {
  id: string; name: string; architecture: string; checkpoint: string;
  characterLora: string | null; styleLora: string | null;
  basePrompt: string; negativePrompt: string; identityStrength: number; styleStrength: number;
};
type Candidate = { id: string; file: string; seed: number };

const api = {
  get: (p: string) => fetch(p).then((r) => r.json()),
  post: (p: string, body?: unknown) =>
    fetch(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }).then((r) => r.json()),
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

export function App() {
  const [diag, setDiag] = useState<any>(null);
  const [checkpoints, setCheckpoints] = useState<Model[]>([]);
  const [loras, setLoras] = useState<Model[]>([]);
  const [anchors, setAnchors] = useState<Anchor[]>([]);

  // anchor form
  const [name, setName] = useState("Character 001");
  const [checkpoint, setCheckpoint] = useState("");
  const [characterLora, setCharacterLora] = useState("");
  const [basePrompt, setBasePrompt] = useState("pixel art, chibi girl, witch hat, full body, white background");
  const [negativePrompt, setNegativePrompt] = useState("blurry, extra limbs, watermark, text");
  const [identityStrength, setIdentityStrength] = useState(0.9);

  // generate
  const [anchorId, setAnchorId] = useState("");
  const [poseUrl, setPoseUrl] = useState("");
  const [control, setControl] = useState(0.9);
  const [seed, setSeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [error, setError] = useState("");

  const refresh = async () => {
    setDiag(await api.get("/api/diagnostics"));
    const m = await api.get("/api/models");
    setCheckpoints(m.checkpoints);
    setCharacterLora("");
    setLoras((await api.get("/api/loras")).loras);
    const a = await api.get("/api/anchors");
    setAnchors(a.anchors);
  };
  useEffect(() => { refresh(); }, []);

  const ckptArch = checkpoints.find((c) => c.filename === checkpoint)?.architecture ?? "unknown";
  const compatLoras = loras.filter((l) => l.architecture === ckptArch && ckptArch !== "unknown");

  async function createAnchor() {
    const a: Anchor = await api.post("/api/anchors", {
      name, architecture: ckptArch, checkpoint,
      characterLora: characterLora || null, styleLora: null,
      basePrompt, negativePrompt, identityStrength, styleStrength: 0.75,
    });
    await refresh();
    setAnchorId(a.id);
  }

  async function onPose(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setPoseUrl(await fileToDataUrl(f));
  }

  async function generate() {
    setError(""); setCandidate(null); setBusy(true);
    try {
      const opts: any = { controlStrength: control };
      if (seed) opts.seed = Number(seed);
      const res = await api.post("/api/frames", { anchorId, pose: poseUrl, opts });
      if (res.error) setError(res.error);
      else setCandidate(res);
    } catch (e: any) { setError(String(e?.message ?? e)); }
    setBusy(false);
  }

  const online = diag?.comfy?.online;

  return (
    <div className="wrap">
      <header>
        <h1>Frame Motion Studio</h1>
        <div className={`pill ${online ? "ok" : "bad"}`}>
          {online ? `ComfyUI online · ${diag?.comfy?.detail}` : `ComfyUI offline · ${diag?.comfy?.detail ?? "…"}`}
        </div>
      </header>

      {diag && (
        <div className="caps">
          {Object.entries(diag.capabilities ?? {}).map(([k, v]) => (
            <span key={k} className={v ? "cap on" : "cap off"}>{k}</span>
          ))}
        </div>
      )}

      <div className="cols">
        <section>
          <h2>1 · Character Anchor</h2>
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Checkpoint
            <select value={checkpoint} onChange={(e) => setCheckpoint(e.target.value)}>
              <option value="">— select —</option>
              {checkpoints.map((c) => <option key={c.filename} value={c.filename}>{c.filename} ({c.architecture})</option>)}
            </select>
          </label>
          <label>Character LoRA <small>({ckptArch})</small>
            <select value={characterLora} onChange={(e) => setCharacterLora(e.target.value)}>
              <option value="">none</option>
              {compatLoras.map((l) => <option key={l.filename} value={l.filename}>{l.filename}</option>)}
            </select>
          </label>
          <label>Base prompt<textarea value={basePrompt} onChange={(e) => setBasePrompt(e.target.value)} /></label>
          <label>Negative<textarea value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} /></label>
          <label>Identity strength · {identityStrength.toFixed(2)}
            <input type="range" min={0} max={1} step={0.05} value={identityStrength}
              onChange={(e) => setIdentityStrength(Number(e.target.value))} />
          </label>
          <button disabled={!checkpoint} onClick={createAnchor}>Save anchor</button>
        </section>

        <section>
          <h2>2 · Pose → Frame</h2>
          <label>Anchor
            <select value={anchorId} onChange={(e) => setAnchorId(e.target.value)}>
              <option value="">— select —</option>
              {anchors.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.checkpoint}</option>)}
            </select>
          </label>
          <label>Pose image<input type="file" accept="image/*" onChange={onPose} /></label>
          {poseUrl && <img className="thumb" src={poseUrl} alt="pose" />}
          <label>Pose lock · {control.toFixed(2)}
            <input type="range" min={0} max={1} step={0.05} value={control} onChange={(e) => setControl(Number(e.target.value))} />
          </label>
          <label>Seed (blank = random)<input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="random" /></label>
          <button disabled={!anchorId || !poseUrl || busy || !online} onClick={generate}>
            {busy ? "Generating…" : "Generate frame"}
          </button>
          {error && <p className="err">{error}</p>}
        </section>

        <section>
          <h2>3 · Review</h2>
          {candidate ? (
            <>
              <img className="frame" src={`/data/${candidate.file}?t=${candidate.id}`} alt="frame" />
              <p className="meta">seed {candidate.seed}</p>
              <div className="row">
                <button className="accept" onClick={async () => { await api.post(`/api/frames/${candidate.id}/accept`); setCandidate(null); }}>Accept</button>
                <button className="reject" onClick={async () => { await api.post(`/api/frames/${candidate.id}/reject`); setCandidate(null); }}>Reject</button>
                <button onClick={generate} disabled={busy}>Regenerate</button>
              </div>
            </>
          ) : <p className="hint">Generate a frame to review it here.</p>}
        </section>
      </div>
    </div>
  );
}
