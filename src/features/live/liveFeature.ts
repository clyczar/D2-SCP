import type { Feature } from "../../app/feature";
import type { FrameWorkerRequest, FrameWorkerResponse } from "../../live/frameWorker";
import { button, el, field } from "../../ui/dom";

type Crop = [number, number, number, number] | null;
type Snapper = (width: number, crop: Crop) => Promise<Blob | null>;

// MediaStreamTrackProcessor (Chrome) isn't in the DOM lib yet.
interface TrackProcessor {
  readable: ReadableStream<VideoFrame>;
}
type TrackProcessorConstructor = new (init: { track: MediaStreamTrack }) => TrackProcessor;

const DEVICE_KEY = "d2scp-live-device";

export const live: Feature = {
  id: "live",
  title: "Live",
  summary: "Show the capture card's picture and keep reading frames in the background.",
  ready: true,
  createPage() {
    const devices = el("select", {});
    const video = el("video", { className: "live-video", autoplay: true, muted: true, playsInline: true });
    const status = el("p", { className: "lead", textContent: "Pick the capture card (it shows up as a camera) and press Start." });
    const stats = el("p", { className: "hint live-stats" });
    const bridge = el("p", { className: "hint" });
    let stream: MediaStream | null = null;
    let worker: Worker | null = null;
    let snapper: Snapper | null = null;
    const pending = new Map<string, (blob: Blob | null) => void>();
    let hiddenFrames = 0;
    let lastFrames = 0;

    async function listDevices(): Promise<void> {
      const cameras = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
      let saved = "";
      try {
        saved = localStorage.getItem(DEVICE_KEY) ?? "";
      } catch {
        // Storage blocked: just default to the first camera.
      }
      devices.replaceChildren(
        ...cameras.map((d, i) => el("option", { value: d.deviceId, textContent: d.label || `Camera ${i + 1}`, selected: d.deviceId === saved })),
      );
      if (cameras.length === 0) devices.append(el("option", { value: "", textContent: "No camera found" }));
    }

    async function start(): Promise<void> {
      stop();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: devices.value ? { exact: devices.value } : undefined, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
          audio: false,
        });
      } catch (error) {
        status.className = "lead error";
        status.textContent = `Couldn't open the camera: ${error instanceof Error ? error.message : String(error)}. Check it's plugged in and not open in another app (like Camera or OBS).`;
        return;
      }
      try {
        localStorage.setItem(DEVICE_KEY, devices.value);
      } catch {
        // Not remembering the device is fine.
      }
      await listDevices();
      video.srcObject = stream;
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      status.className = "lead success";
      status.textContent = `Showing ${track.label || "camera"} at ${settings.width}×${settings.height}, ${Math.round(settings.frameRate ?? 0)} fps requested.`;

      const Processor = (globalThis as { MediaStreamTrackProcessor?: TrackProcessorConstructor }).MediaStreamTrackProcessor;
      if (Processor) {
        worker = new Worker(new URL("../../live/frameWorker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<FrameWorkerResponse>) => onWorker(event.data);
        const { readable } = new Processor({ track });
        worker.postMessage({ type: "stream", readable } satisfies FrameWorkerRequest, [readable]);
        snapper = (width, crop) =>
          new Promise((resolve) => {
            const id = crypto.randomUUID();
            pending.set(id, resolve);
            worker!.postMessage({ type: "snap", id, width, crop } satisfies FrameWorkerRequest);
          });
      } else {
        stats.textContent = "This browser can't read frames in the background (needs Chrome or Edge), so snapshots come from the visible video only.";
        snapper = (width, crop) => snapFromVideo(video, width, crop);
      }
    }

    function onWorker(message: FrameWorkerResponse): void {
      if (message.type === "stats") {
        if (document.hidden) hiddenFrames += message.frames - lastFrames;
        lastFrames = message.frames;
        stats.textContent =
          `Reading ${message.width}×${message.height} at ${message.fps.toFixed(1)} fps · ${message.frames.toLocaleString()} frames` +
          (hiddenFrames > 0 ? ` · ${hiddenFrames.toLocaleString()} while this tab was hidden` : "");
      } else if (message.type === "snap") {
        pending.get(message.id)?.(message.blob);
        pending.delete(message.id);
      } else {
        stats.textContent = "The camera stopped sending frames.";
      }
    }

    function stop(): void {
      worker?.terminate();
      worker = null;
      snapper = null;
      for (const track of stream?.getTracks() ?? []) track.stop();
      stream = null;
      video.srcObject = null;
      hiddenFrames = 0;
      lastFrames = 0;
    }

    async function saveSnapshot(): Promise<void> {
      const blob = await snapper?.(0, null);
      if (!blob) return;
      const link = el("a", { href: URL.createObjectURL(blob), download: `d2scp-frame-${Date.now()}.png` });
      link.click();
      URL.revokeObjectURL(link.href);
    }

    // Dev server only: lets a Claude session ask for a frame with `curl http://127.0.0.1:5290/__bot/snap?width=640`.
    if (import.meta.hot) {
      bridge.textContent = "Snapshot bridge on: GET /__bot/snap?width=640[&crop=x,y,w,h] saves the latest frame to captures/latest.png.";
      import.meta.hot.on("bot:snap", async ({ id, width, crop }: { id: string; width: number; crop: string | null }) => {
        if (!snapper) return;
        const box = crop?.split(",").map(Number);
        const blob = await snapper(width, box?.length === 4 && box.every(Number.isFinite) ? (box as [number, number, number, number]) : null);
        if (blob) await fetch(`/__bot/frame?id=${encodeURIComponent(id)}`, { method: "POST", body: blob });
      });
    } else {
      bridge.textContent = "The snapshot bridge only runs on the local dev server (npm run dev).";
    }

    void listDevices().catch(() => {});
    return {
      root: el(
        "div",
        { className: "page" },
        el(
          "section",
          { className: "panel" },
          el("div", { className: "panel-head" }, el("h2", { textContent: "Capture card" })),
          status,
          el(
            "div",
            { className: "live-controls" },
            field("Camera", devices),
            button("Start", () => void start(), "primary"),
            button("Stop", stop),
            button("Save snapshot", () => void saveSnapshot(), "small"),
          ),
          video,
          stats,
          bridge,
        ),
      ),
    };
  },
};

async function snapFromVideo(video: HTMLVideoElement, width: number, crop: Crop): Promise<Blob | null> {
  if (!video.videoWidth) return null;
  const [sx, sy, sw, sh] = crop ?? [0, 0, video.videoWidth, video.videoHeight];
  const scale = width > 0 && width < sw ? width / sw : 1;
  const canvas = el("canvas", { width: Math.round(sw * scale), height: Math.round(sh * scale) });
  canvas.getContext("2d")!.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
