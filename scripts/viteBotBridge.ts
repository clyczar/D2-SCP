import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const ANSWER_MS = 5000;

/**
 * Dev-server-only endpoints so a Claude session can see the capture card:
 * GET /__bot/snap?width=640&crop=x,y,w,h asks the open Live page for its latest frame,
 * which it POSTs back to /__bot/frame; the frame lands in captures/latest.png.
 */
export function botBridge(dir = "captures"): Plugin {
  return {
    name: "d2scp-bot-bridge",
    apply: "serve",
    configureServer(server) {
      const folder = resolve(server.config.root, dir);
      const waiting = new Map<string, (path: string) => void>();

      server.middlewares.use("/__bot/snap", (req, res) => {
        const query = new URL(req.url ?? "/", "http://local").searchParams;
        const id = crypto.randomUUID();
        const reply = (status: number, body: object) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        const timer = setTimeout(() => {
          waiting.delete(id);
          reply(504, { error: "No Live page answered: open #/live in Chrome and press Start." });
        }, ANSWER_MS);
        waiting.set(id, (path) => {
          clearTimeout(timer);
          reply(200, { path });
        });
        server.ws.send({ type: "custom", event: "bot:snap", data: { id, width: Number(query.get("width")) || 0, crop: query.get("crop") } });
      });

      server.middlewares.use("/__bot/frame", (req, res) => {
        const id = new URL(req.url ?? "/", "http://local").searchParams.get("id") ?? "";
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          const done = waiting.get(id);
          waiting.delete(id);
          res.statusCode = done ? 204 : 410;
          res.end();
          if (!done) return;
          mkdirSync(folder, { recursive: true });
          const path = resolve(folder, "latest.png");
          writeFileSync(path, Buffer.concat(chunks));
          done(path);
        });
      });
    },
  };
}
