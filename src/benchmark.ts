import type { WebGLRenderer } from "three";
import { Vector2 } from "three";

interface BenchmarkOptions {
  renderer: WebGLRenderer;
  canvas: HTMLCanvasElement;
  getQuality(): Record<string, unknown>;
  onStart?(): void;
}

const WARMUP_MS = 2000;
const RECORD_MS = 10000;
function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return { median: round(sorted[Math.floor(sorted.length / 2)] ?? 0), p95: round(sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0), min: round(sorted[0] ?? 0), max: round(sorted.at(-1) ?? 0) };
}

/** Explicit diagnostic mode; ordinary sessions create no panel or frame counters. */
export function buildBenchmark(options: BenchmarkOptions) {
  if (new URLSearchParams(location.search).get("benchmark") !== "1") return null;
  const { renderer, canvas } = options;
  const previousAutoReset = renderer.info.autoReset;
  renderer.info.autoReset = false;
  const panel = document.createElement("details");
  panel.open = true;
  panel.id = "benchmark-panel";
  Object.assign(panel.style, { position: "fixed", top: "82px", right: "12px", zIndex: "12", width: "min(410px, calc(100vw - 24px))", maxHeight: "calc(100dvh - 100px)", overflow: "auto", padding: "12px", color: "#eef1e6", background: "#0d1b22f2", border: "1px solid #8aa68a", borderRadius: "6px", font: "11px/1.5 monospace", touchAction: "pan-y", userSelect: "text" });
  const title = document.createElement("summary");
  title.textContent = "Performance benchmark";
  title.style.cursor = "pointer";
  const explanation = document.createElement("p");
  explanation.textContent = "2 s warm-up + 10 s recording. Keep the view and settings consistent; movement is allowed. CPU submission time is not GPU time.";
  const start = document.createElement("button"); start.id = "benchmark-start";
  start.textContent = "Run 12-second benchmark";
  const download = document.createElement("button"); download.id = "benchmark-download";
  download.textContent = "Download JSON"; download.disabled = true;
  for (const button of [start, download]) Object.assign(button.style, { minHeight: "40px", padding: "7px 10px", margin: "3px", background: "#253c32", color: "#eef1e6", border: "1px solid #8aa68a", borderRadius: "4px", font: "inherit", cursor: "pointer" });
  const status = document.createElement("p"); status.id = "benchmark-status"; status.setAttribute("role", "status");
  status.textContent = "Ready. Results include all sky, habitat and avatar render passes.";
  const output = document.createElement("pre"); output.id = "benchmark-results";
  Object.assign(output.style, { whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: "220px", overflow: "auto", margin: "6px 0 0", font: "10px/1.45 monospace" });
  panel.append(title, explanation, start, download, status, output);
  document.body.append(panel);
  let state: "idle" | "warmup" | "recording" = "idle";
  let warmupUntil = 0; let recordStart = 0; let cpuStart = 0; let rafNow = 0;
  let lastStatus = 0;
  let report: Record<string, unknown> | null = null;
  let startContext: Record<string, unknown> = {};
  const frameTimes: number[] = []; const cpuTimes: number[] = [];
  const calls: number[] = []; const triangles: number[] = []; const points: number[] = [];
  const rafTimes: number[] = [];
  function stop(message: string) {
    state = "idle"; start.disabled = false; status.textContent = message;
  }
  function hidden() { if (document.hidden && state !== "idle") stop("Cancelled: the browser tab was hidden. Start a fresh run."); }
  document.addEventListener("visibilitychange", hidden);
  start.addEventListener("click", () => {
    frameTimes.length = cpuTimes.length = calls.length = triangles.length = points.length = rafTimes.length = 0;
    report = null; output.textContent = ""; download.disabled = true;
    startContext = { ...options.getQuality() };
    warmupUntil = performance.now() + WARMUP_MS;
    lastStatus = 0; state = "warmup"; start.disabled = true;
    status.textContent = "Warming up…";
    start.blur(); canvas.focus({ preventScroll: true }); options.onStart?.();
  });
  download.addEventListener("click", () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "torus-browser-benchmark.json";
    link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); download.blur(); canvas.focus({ preventScroll: true });
  });
  return {
    beginFrame(now: number) {
      renderer.info.reset();
      if (state === "idle") return;
      const current = performance.now();
      cpuStart = current; rafNow = now;
      if (state === "warmup" && current >= warmupUntil) { state = "recording"; recordStart = current; }
    },
    endFrame(now: number) {
      if (state === "idle") return;
      if (state === "recording") {
        if (rafTimes.length) frameTimes.push(rafNow - rafTimes[rafTimes.length - 1]);
        rafTimes.push(rafNow); cpuTimes.push(Math.max(0, now - cpuStart));
        calls.push(renderer.info.render.calls); triangles.push(renderer.info.render.triangles); points.push(renderer.info.render.points);
        if (now - recordStart >= RECORD_MS) {
          const gl = renderer.getContext();
          const debug = gl.getExtension("WEBGL_debug_renderer_info");
          const dimensions = renderer.getDrawingBufferSize(new Vector2());
          const span = (rafTimes.at(-1) ?? 0) - (rafTimes[0] ?? 0);
          report = {
            schemaVersion: 1, kind: "browser-frame-benchmark", recordedAt: new Date().toISOString(),
            environment: { userAgent: navigator.userAgent, webglVersion: gl.getParameter(gl.VERSION), renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), viewport: { width: canvas.clientWidth, height: canvas.clientHeight }, drawingBuffer: { width: dimensions.x, height: dimensions.y }, devicePixelRatio, renderPixelRatio: renderer.getPixelRatio() },
            context: startContext, endContext: options.getQuality(),
            methodology: { warmupSeconds: WARMUP_MS / 1000, targetRecordingSeconds: RECORD_MS / 1000, actualRecordingSeconds: Math.round((now - recordStart) / 10) / 100, frames: cpuTimes.length, renderCounters: "Sum of sky, habitat, avatar and shadow render calls; reset once per frame", cpuSubmission: "Main-thread frame work through render submission; excludes asynchronous GPU completion", gpuTime: "Not measured", scenePose: "Chosen by the operator; compare like-for-like view, movement, resolution and quality" },
            results: { averageFps: Math.round((Math.max(0, rafTimes.length - 1) * 1000 / Math.max(1, span)) * 100) / 100, rafFrameMs: summary(frameTimes), cpuSubmissionMs: summary(cpuTimes), renderCalls: summary(calls), renderedTriangles: summary(triangles), renderedPoints: summary(points), rendererMemory: { ...renderer.info.memory } },
          };
          output.textContent = JSON.stringify(report, null, 2); download.disabled = false;
          stop(`Complete: ${(report.results as { averageFps: number }).averageFps} FPS across ${cpuTimes.length} frames. JSON is shown below.`);
          return;
        }
      }
      if (now - lastStatus > 250) {
        const remaining = state === "warmup" ? warmupUntil - now : RECORD_MS - (now - recordStart);
        status.textContent = `${state === "warmup" ? "Warming up" : "Recording"} · ${Math.max(0, remaining / 1000).toFixed(1)} s remaining`;
        lastStatus = now;
      }
    },
    dispose() { renderer.info.autoReset = previousAutoReset; document.removeEventListener("visibilitychange", hidden); panel.remove(); },
  };
}
