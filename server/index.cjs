const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const event = require("../shared/event.json");

const app = express();
const port = process.env.PORT || 3001;
const root = path.resolve(__dirname, "..");
const splashFocusFile = path.join(root, "shared", "splash-focus-overrides.json");
const redisUrl = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, "");
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const isVercel = Boolean(process.env.VERCEL);
const hasRedis = Boolean(redisUrl && redisToken);
const sharedStoreError = "Shared storage is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.";
const stateKey = "css-draft-lab:overlay-state";
const splashFocusKey = "css-draft-lab:splash-focus";
const stateChannel = "css-draft-lab:overlay-state-updates";
const splashFocusChannel = "css-draft-lab:splash-focus-updates";
let sharedOverlayState = null;
let sharedSplashFocus = {};
const overlayClients = new Set();
const splashFocusClients = new Set();

try {
  sharedSplashFocus = JSON.parse(fs.readFileSync(splashFocusFile, "utf8"));
} catch {}

if (Boolean(redisUrl) !== Boolean(redisToken)) {
  throw new Error(sharedStoreError);
}

async function redisCommand(command, ...args) {
  const response = await fetch(redisUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([command, ...args]),
  });
  if (!response.ok) throw new Error(`Upstash request failed (${response.status})`);
  const payload = await response.json();
  if (payload.error) throw new Error("Upstash returned an error");
  return payload.result;
}

async function readSharedValue(key, fallback) {
  if (!hasRedis) return fallback;
  const value = await redisCommand("GET", key);
  return typeof value === "string" ? JSON.parse(value) : fallback;
}

async function writeSharedValue(key, channel, value, ttlSeconds) {
  const serialized = JSON.stringify(value);
  const setArgs = ttlSeconds ? [key, serialized, "EX", ttlSeconds] : [key, serialized];
  await redisCommand("SET", ...setArgs);
  await redisCommand("PUBLISH", channel, serialized);
}

function requireSharedStore(res) {
  if (!isVercel || hasRedis) return false;
  res.status(503).json({ error: sharedStoreError });
  return true;
}

function setSseHeaders(res) {
  res.status(200).set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
}

async function streamFromRedis(req, res, key, channel, fallback) {
  const controller = new AbortController();
  let closed = false;
  const closeStream = () => {
    if (closed) return;
    closed = true;
    controller.abort();
  };
  res.on("close", closeStream);
  let heartbeat;

  try {
    const upstream = await fetch(`${redisUrl}/subscribe/${encodeURIComponent(channel)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redisToken}`,
        Accept: "text/event-stream",
      },
      signal: controller.signal,
    });
    if (!upstream.ok || !upstream.body) throw new Error(`Upstash stream failed (${upstream.status})`);

    setSseHeaders(res);
    heartbeat = setInterval(() => {
      if (!res.destroyed) res.write(": keep-alive\n\n");
    }, 20000);
    heartbeat.unref?.();

    const snapshot = await readSharedValue(key, fallback);
    if (snapshot !== null && snapshot !== undefined) {
      res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!closed) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const data = frame.split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        const messagePrefix = `message,${channel},`;
        if (data.startsWith(messagePrefix) && !res.destroyed) {
          res.write(`data: ${data.slice(messagePrefix.length)}\n\n`);
        }
      }
    }
  } catch (error) {
    if (!closed) {
      console.error("Redis event stream failed:", error.message);
      if (!res.headersSent) res.status(502).json({ error: "Realtime stream unavailable" });
    }
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (!res.writableEnded && !res.destroyed) res.end();
  }
}

function broadcastLocal(clients, message) {
  for (const client of clients) {
    if (client.destroyed) clients.delete(client);
    else client.write(message);
  }
}

app.use(express.json({ limit: "2mb" }));

app.get("/api/config", (_req, res) => {
  res.json({ event, modes: ["standard", "mpl", "free"], timerSeconds: 30 });
});

app.get("/api/heroes", (_req, res) => {
  const heroes = JSON.parse(fs.readFileSync(path.join(root, "shared", "heroes.json"), "utf8"));
  res.set("Cache-Control", "no-store").json(heroes);
});

app.get("/api/splash-focus", async (_req, res) => {
  if (requireSharedStore(res)) return;
  try {
    const focus = await readSharedValue(splashFocusKey, sharedSplashFocus);
    res.set("Cache-Control", "no-store").json(focus);
  } catch (error) {
    console.error("Could not read splash focus:", error.message);
    res.status(503).json({ error: "Could not load shared splash focus" });
  }
});

app.get("/api/splash-focus/stream", (req, res) => {
  if (hasRedis) return streamFromRedis(req, res, splashFocusKey, splashFocusChannel, sharedSplashFocus);
  if (requireSharedStore(res)) return;
  setSseHeaders(res);
  splashFocusClients.add(res);
  res.write(`data: ${JSON.stringify(sharedSplashFocus)}\n\n`);
  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 20000);
  heartbeat.unref?.();
  res.on("close", () => {
    clearInterval(heartbeat);
    splashFocusClients.delete(res);
  });
});

app.post("/api/splash-focus", async (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ error: "Invalid splash focus map" });
  }
  const nextFocus = {};
  for (const [key, value] of Object.entries(req.body)) {
    if (!/^[a-z0-9-]+$/.test(key) || !Number.isFinite(value) || value < 0 || value > 1) {
      return res.status(400).json({ error: "Invalid splash focus entry" });
    }
    nextFocus[key] = value;
  }
  if (requireSharedStore(res)) return;
  try {
    if (hasRedis) {
      await writeSharedValue(splashFocusKey, splashFocusChannel, nextFocus);
    } else {
      fs.writeFileSync(splashFocusFile, `${JSON.stringify(nextFocus, null, 2)}\n`);
    }
  } catch (error) {
    console.error("Could not save splash focus:", error.message);
    return res.status(503).json({ error: "Could not save shared splash focus" });
  }
  sharedSplashFocus = nextFocus;
  broadcastLocal(splashFocusClients, `data: ${JSON.stringify(sharedSplashFocus)}\n\n`);
  res.status(204).end();
});

app.get("/api/state", async (_req, res) => {
  if (requireSharedStore(res)) return;
  try {
    const state = await readSharedValue(stateKey, sharedOverlayState || {});
    res.set("Cache-Control", "no-store").json(state);
  } catch (error) {
    console.error("Could not read overlay state:", error.message);
    res.status(503).json({ error: "Could not load shared draft state" });
  }
});

app.get("/api/state/stream", (req, res) => {
  if (hasRedis) return streamFromRedis(req, res, stateKey, stateChannel, sharedOverlayState);
  if (requireSharedStore(res)) return;
  setSseHeaders(res);
  overlayClients.add(res);
  if (sharedOverlayState) res.write(`data: ${JSON.stringify(sharedOverlayState)}\n\n`);
  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 20000);
  heartbeat.unref?.();
  res.on("close", () => {
    clearInterval(heartbeat);
    overlayClients.delete(res);
  });
});

app.post("/api/state", async (req, res) => {
  if (!req.body || typeof req.body !== "object" || !req.body.draft || !req.body.teamMeta) {
    return res.status(400).json({ error: "Invalid draft state" });
  }
  if (requireSharedStore(res)) return;
  if (hasRedis) {
    try {
      await writeSharedValue(stateKey, stateChannel, req.body, 60 * 60 * 24 * 7);
    } catch (error) {
      console.error("Could not save overlay state:", error.message);
      return res.status(503).json({ error: "Could not save shared draft state" });
    }
  }
  sharedOverlayState = req.body;
  broadcastLocal(overlayClients, `data: ${JSON.stringify(sharedOverlayState)}\n\n`);
  res.status(204).end();
});

if (process.env.NODE_ENV === "production" && !isVercel) {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(path.join(root, "dist", "index.html")));
}

module.exports = app;

if (require.main === module) {
  app.listen(port, () => {
    console.log(`CSS Draft Lab API running at http://localhost:${port}`);
  });
}
