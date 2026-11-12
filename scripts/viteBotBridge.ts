import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const ANSWER_MS = 5000;

/**
 * Dev-server-only endpoints so a Claude session can see the capture card:
 * GET /__bot/snap?width=640&crop=x,y,w,h asks the open Live page for its latest frame,
 * which it POSTs back to /__bot/frame; the frame lands in captures/latest.png.
 * POST /__bot/save and GET /__bot/load?name=… keep a disk copy of browser storage in local-data/.
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

      // Disk mirror of browser storage (src/app/diskBackup.ts): local-data/<name>.json.
      const dataFolder = resolve(server.config.root, "local-data");
      const dataFile = (url: string | undefined) => {
        const name = new URL(url ?? "/", "http://local").searchParams.get("name") ?? "";
        return /^[a-z0-9-]{1,40}$/.test(name) ? resolve(dataFolder, `${name}.json`) : null;
      };
      server.middlewares.use("/__bot/save", (req, res) => {
        const file = dataFile(req.url);
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          if (!file || req.method !== "POST") {
            res.statusCode = 400;
            return res.end();
          }
          mkdirSync(dataFolder, { recursive: true });
          writeFileSync(`${file}.tmp`, Buffer.concat(chunks));
          renameSync(`${file}.tmp`, file);
          res.statusCode = 204;
          res.end();
        });
      });
      server.middlewares.use("/__bot/load", (req, res) => {
        const file = dataFile(req.url);
        if (!file || !existsSync(file)) {
          res.statusCode = 404;
          return res.end();
        }
        res.setHeader("content-type", "application/json");
        res.end(readFileSync(file));
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
