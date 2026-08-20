import React, { useEffect, useRef, useState } from "react";

type Model = { filename: string; architecture: string };
type Anchor = {
  id: string; name: string; architecture: string; checkpoint: string;
  characterLora: string | null; styleLora: string | null;
  basePrompt: string; negativePrompt: string; identityStrength: number; styleStrength: number;
};
type Preset = { id: string; fps: number; loop: boolean; frames: number; poses: string[] };
type Frame = { index: number; pose: string; status: string; seed: number | null; image: string | null };
type Project = {
  id: string; character: string; animation: string; fps: number; loop: boolean;
  transparent: boolean; baseSeed: number; frames: Frame[];
};

const api = {
  get: (p: string) => fetch(p).then((r) => r.json()),
  post: (p: string, b?: unknown) =>
    fetch(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b ?? {}) }).then((r) => r.json()),
};
const STATUS: Record<string, string> = { accepted: "✓", review: "!", generating: "⟳", failed: "×", empty: "○" };

export function App() {
  const [diag, setDiag] = useState<any>(null);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [checkpoints, setCheckpoints] = useState<Model[]>([]);

  const [anchorId, setAnchorId] = useState("");
  const [presetId, setPresetId] = useState("");
  const [project, setProject] = useState<Project | null>(null);

  const [selected, setSelected] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [newChar, setNewChar] = useState(false);

  const online = diag?.comfy?.online;
  const anchor = anchors.find((a) => a.id === anchorId);
  const preset = presets.find((p) => p.id === presetId);
  const ready = project?.frames.filter((f) => f.image) ?? [];

  useEffect(() => {
    (async () => {
      setDiag(await api.get("/api/diagnostics"));
      setAnchors((await api.get("/api/anchors")).anchors);
      const pr = (await api.get("/api/presets")).presets;
      setPresets(pr);
      if (pr[0]) setPresetId(pr[0].id);
      setCheckpoints((await api.get("/api/models")).checkpoints);
      // Resume the most recent animation so the workspace isn't empty on load.
      const anims: Project[] = (await api.get("/api/animations")).animations;
      const last = anims[anims.length - 1];
      if (last) { setProject(last); setAnchorId(last.character); setPresetId(last.animation); }
    })();
  }, []);

  // Playback: advance playhead across generated frames at project fps.
  useEffect(() => {
    if (!playing || ready.length === 0) return;
    const fps = project?.fps ?? 8;
    const t = setInterval(() => setPlayhead((h) => (h + 1) % ready.length), 1000 / fps);
    return () => clearInterval(t);
  }, [playing, ready.length, project?.fps]);

  // Poll while any frame is generating.
  useEffect(() => {
    if (!project) return;
    const generating = project.frames.some((f) => f.status === "generating" || f.status === "empty");
    if (!generating) return;
    const t = setInterval(async () => setProject(await api.get(`/api/animations/${project.id}`)), 2000);
    return () => clearInterval(t);
  }, [project?.id, project?.frames.map((f) => f.status).join("")]);

  async function generate() {
    if (!anchorId || !presetId) return;
    setBusy(true); setMsg("");
    const p: Project = await api.post("/api/animations", { anchorId, presetId, transparent: true });
    await api.post(`/api/animations/${p.id}/generate`);
    setProject(await api.get(`/api/animations/${p.id}`));
    setSelected(0); setPlayhead(0); setBusy(false);
  }
  async function regen() {
    if (!project) return;
    setMsg("regenerating frame " + (selected + 1));
    const f: Frame = await api.post(`/api/animations/${project.id}/frames/${selected}/generate`, { seed: Math.floor(Math.random() * 2 ** 31) });
    setProject(await api.get(`/api/animations/${project.id}`)); setMsg("");
  }
  async function accept() {
    if (!project) return;
    await api.post(`/api/animations/${project.id}/frames/${selected}/accept`);
    setProject(await api.get(`/api/animations/${project.id}`));
  }
  async function exportAs(format: string) {
    if (!project) return;
    const r = await api.post(`/api/animations/${project.id}/export`, { format });
    setMsg(r.file ? `Exported ${format}: ${r.file}` : r.dir ? `Exported ${r.frames} PNGs → ${r.dir}` : JSON.stringify(r));
  }
  async function createAnchor(form: Partial<Anchor>) {
    const a = await api.post("/api/anchors", form);
    setAnchors((await api.get("/api/anchors")).anchors);
    setAnchorId(a.id); setNewChar(false);
  }

  const stageFrame = playing ? ready[playhead] : project?.frames[selected];
  const stageSrc = stageFrame?.image ? `/data/${stageFrame.image}` : null;

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Frame Motion</span>
        <span className="ctx">{anchor?.name ?? "No character"}</span>
        <span className="ctx dim">{preset ? `${preset.id} · ${preset.frames}f · ${preset.fps}fps` : ""}</span>
        <span className="spacer" />
        <span className={`dot ${online ? "ok" : "bad"}`} title={diag?.comfy?.detail}>● {online ? "Ready" : "Offline"}</span>
        <button className="ghost" disabled={!ready.length} onClick={() => exportAs("sprite-sheet")}>Export</button>
      </header>

      <div className="work">
        {/* CHARACTER */}
        <aside className="drawer">
          <h3>Character</h3>
          <div className="cards">
            {anchors.map((a) => (
              <button key={a.id} className={`card ${a.id === anchorId ? "sel" : ""}`} onClick={() => setAnchorId(a.id)}>
                <div className="cardimg" style={{ background: "#181b22" }}>{a.name[0]}</div>
                <span>{a.name}</span>
              </button>
            ))}
            <button className="card add" onClick={() => setNewChar(true)}>＋<span>New</span></button>
          </div>
          {newChar && <NewCharacter checkpoints={checkpoints} onCreate={createAnchor} onCancel={() => setNewChar(false)} />}
        </aside>

        {/* STAGE */}
        <main className="stage">
          <div className="stagecanvas checker">
            {stageSrc ? <img src={stageSrc} alt="frame" /> : (
              <div className="empty">
                {!anchorId ? "Pick a character →" : !project ? "Choose a motion, then Generate" : "Generating…"}
              </div>
            )}
          </div>
          <div className="playback">
            <button onClick={() => { setPlaying(false); setPlayhead((h) => Math.max(0, h - 1)); }} disabled={!ready.length}>⏮</button>
            <button className="play" onClick={() => setPlaying((p) => !p)} disabled={ready.length < 2}>{playing ? "❚❚" : "▶"}</button>
            <button onClick={() => { setPlaying(false); setPlayhead((h) => (h + 1) % Math.max(1, ready.length)); }} disabled={!ready.length}>⏭</button>
            <span className="dim">{project ? `${project.fps} FPS` : ""}</span>
            {project?.loop && <span className="dim">Loop</span>}
            {project?.transparent && <span className="dim">Alpha</span>}
            <span className="spacer" />
            {msg && <span className="msg">{msg}</span>}
          </div>
        </main>

        {/* MOTION */}
        <aside className="drawer">
          <h3>Motion</h3>
          <div className="cards">
            {presets.map((p) => (
              <button key={p.id} className={`card ${p.id === presetId ? "sel" : ""}`} onClick={() => setPresetId(p.id)}>
                <div className="cardimg pose"><img src={`/presets/${p.id}/${p.poses[0]}`} alt={p.id} /></div>
                <span>{p.id}</span>
              </button>
            ))}
          </div>
          <button className="primary" disabled={!anchorId || !presetId || busy || !online} onClick={generate}>
            {busy ? "Starting…" : project ? "Regenerate All" : "Generate Animation"}
          </button>
          {project && (
            <div className="frameops">
              <button onClick={regen} disabled={!ready.length}>Regenerate frame {selected + 1}</button>
              <button className="accept" onClick={accept} disabled={!project.frames[selected]?.image}>Accept frame {selected + 1}</button>
              <div className="exps">
                <button className="ghost" onClick={() => exportAs("png-sequence")}>PNG seq</button>
                <button className="ghost" onClick={() => exportAs("sprite-sheet")}>Sprite sheet</button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* TIMELINE */}
      <footer className="timeline">
        {project ? project.frames.map((f) => (
          <button key={f.index} className={`frame ${f.index === selected ? "sel" : ""} st-${f.status}`}
            onClick={() => { setPlaying(false); setSelected(f.index); }}>
            <div className="thumb checker">
              {f.image ? <img src={`/data/${f.image}`} alt="" /> : <span className="ph">{STATUS[f.status] ?? "○"}</span>}
            </div>
            <span className="fnum">{String(f.index + 1).padStart(2, "0")} <b>{STATUS[f.status] ?? ""}</b></span>
          </button>
        )) : <div className="tl-empty">Timeline — generate an animation to populate frames</div>}
      </footer>
    </div>
  );
}

function NewCharacter({ checkpoints, onCreate, onCancel }: {
  checkpoints: Model[]; onCreate: (f: Partial<Anchor>) => void; onCancel: () => void;
}) {
  const [name, setName] = useState("Character");
  const [checkpoint, setCheckpoint] = useState(checkpoints[0]?.filename ?? "");
  const [basePrompt, setBasePrompt] = useState("pixel art, chibi anime girl, full body, standing, simple background, sprite");
  const arch = checkpoints.find((c) => c.filename === checkpoint)?.architecture ?? "illustrious";
  return (
    <div className="newchar">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
      <select value={checkpoint} onChange={(e) => setCheckpoint(e.target.value)}>
        {checkpoints.map((c) => <option key={c.filename} value={c.filename}>{c.filename} ({c.architecture})</option>)}
      </select>
      <textarea value={basePrompt} onChange={(e) => setBasePrompt(e.target.value)} />
      <div className="row">
        <button className="primary" onClick={() => onCreate({ name, checkpoint, architecture: arch, basePrompt, negativePrompt: "blurry, extra limbs, deformed, watermark, text, realistic, 3d" })}>Create</button>
        <button className="ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
