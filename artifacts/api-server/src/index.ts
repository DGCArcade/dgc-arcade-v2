import { createServer } from "node:http";
import { initSentry } from "./lib/sentry.js";
import app, { ALLOWED_ORIGINS } from "./app.js";
import { logger } from "./lib/logger.js";
import { startBackgroundTasks } from "./lib/background-tasks.js";
import {
  createLiveOddsSocketServer,
  startLiveOddsWorker,
} from "./lib/live-odds-realtime.js";

initSentry();

const rawPort = process.env.PORT;
if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);
const io = createLiveOddsSocketServer(httpServer, ALLOWED_ORIGINS);
let stopBackgroundTasks: () => void = () => {};
let stopLiveOddsWorker: () => void = () => {};
let shuttingDown = false;

httpServer.on("error", (error) => {
  logger.error({ error }, "HTTP server error");
  process.exitCode = 1;
});

httpServer.listen(port, () => {
  stopBackgroundTasks = startBackgroundTasks();
  stopLiveOddsWorker = startLiveOddsWorker(io);
  logger.info({ port }, "Server listening with realtime sportsbook updates");
});

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");

  stopLiveOddsWorker();
  stopBackgroundTasks();

  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  io.close(() => {
    clearTimeout(forceExit);
    logger.info("HTTP and Socket.IO servers stopped");
  });
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
