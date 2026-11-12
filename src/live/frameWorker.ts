// Reads camera frames off the main thread, so a hidden or background tab keeps processing them
// (requestAnimationFrame and timers there are throttled; a stream reader in a worker isn't).

export type FrameWorkerRequest =
  | { type: "stream"; readable: ReadableStream<VideoFrame> }
  | { type: "snap"; id: string; width: number; crop: [number, number, number, number] | null };

export type FrameWorkerResponse =
  | { type: "stats"; fps: number; frames: number; width: number; height: number }
  | { type: "snap"; id: string; blob: Blob | null; error?: string }
  | { type: "ended" };

let latest: VideoFrame | null = null;
let frames = 0;
let windowFrames = 0;
let windowStart = performance.now();

const post = (message: FrameWorkerResponse) => postMessage(message);

async function read(readable: ReadableStream<VideoFrame>): Promise<void> {
  const reader = readable.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    latest?.close();
    latest = value;
    frames++;
    windowFrames++;
    const now = performance.now();
    if (now - windowStart >= 1000) {
      post({ type: "stats", fps: (windowFrames * 1000) / (now - windowStart), frames, width: value.displayWidth, height: value.displayHeight });
      windowFrames = 0;
      windowStart = now;
    }
  }
  post({ type: "ended" });
}

async function snap(id: string, width: number, crop: [number, number, number, number] | null): Promise<void> {
  if (!latest) return post({ type: "snap", id, blob: null, error: "No frame yet." });
  const [sx, sy, sw, sh] = crop ?? [0, 0, latest.displayWidth, latest.displayHeight];
  const scale = width > 0 && width < sw ? width / sw : 1;
  const canvas = new OffscreenCanvas(Math.round(sw * scale), Math.round(sh * scale));
  canvas.getContext("2d")!.drawImage(latest, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  post({ type: "snap", id, blob: await canvas.convertToBlob({ type: "image/png" }) });
}

addEventListener("message", (event: MessageEvent<FrameWorkerRequest>) => {
  const message = event.data;
  if (message.type === "stream") void read(message.readable);
  else void snap(message.id, message.width, message.crop);
});
