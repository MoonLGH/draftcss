const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const event = require("../shared/event.json");

const app = express();
const port = process.env.PORT || 3001;
const root = path.resolve(__dirname, "..");
let sharedOverlayState = null;
const overlayClients = new Set();

app.use(express.json({ limit: "2mb" }));

app.get("/api/config", (_req, res) => {
  res.json({ event, modes: ["standard", "mpl", "free"], timerSeconds: 30 });
});

app.get("/api/heroes", (_req, res) => {
  const heroes = JSON.parse(fs.readFileSync(path.join(root, "shared", "heroes.json"), "utf8"));
  res.set("Cache-Control", "no-store").json(heroes);
});

app.get("/api/state", (_req, res) => {
  res.set("Cache-Control", "no-store").json(sharedOverlayState || {});
});

app.get("/api/state/stream", (req, res) => {
  res.status(200).set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  overlayClients.add(res);
  if (sharedOverlayState) res.write(`data: ${JSON.stringify(sharedOverlayState)}\n\n`);
  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 20000);
  req.on("close", () => {
    clearInterval(heartbeat);
    overlayClients.delete(res);
  });
});

app.post("/api/state", (req, res) => {
  if (!req.body || typeof req.body !== "object" || !req.body.draft || !req.body.teamMeta) {
    return res.status(400).json({ error: "Invalid draft state" });
  }
  sharedOverlayState = req.body;
  const event = `data: ${JSON.stringify(sharedOverlayState)}\n\n`;
  for (const client of overlayClients) {
    if (client.destroyed) overlayClients.delete(client);
    else client.write(event);
  }
  res.status(204).end();
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(path.join(root, "dist", "index.html")));
}

app.listen(port, () => {
  console.log(`CSS Draft Lab API running at http://localhost:${port}`);
});
