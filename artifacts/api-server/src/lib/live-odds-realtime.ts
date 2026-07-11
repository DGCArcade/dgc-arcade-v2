import type { Server as HttpServer } from "node:http";
import { Server as SocketServer, type Socket } from "socket.io";
import { logger } from "./logger.js";
import {
  emptyLiveOddsSnapshot,
  readLiveOddsSnapshot,
  type LiveOddsSnapshot,
  withLiveOddsSyncLock,
  writeLiveOddsSnapshot,
} from "./live-odds-cache.js";
import {
  fetchAllLiveEvents,
  isSportsGameOddsConfigured,
} from "./sportsgameodds.js";

const LIVE_ODDS_INTERVAL_MS = 30_000;

interface ClientToServerEvents {
  "sportsbook:subscribe": () => void;
}

interface ServerToClientEvents {
  "sportsbook:odds:update": (snapshot: LiveOddsSnapshot) => void;
  "sportsbook:status": (status: LiveOddsWorkerStatus) => void;
}

export interface LiveOddsWorkerStatus {
  connected: boolean;
  configured: boolean;
  workerHealthy: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  message?: string;
}

export type LiveOddsSocketServer = SocketServer<
  ClientToServerEvents,
  ServerToClientEvents
>;

let workerStatus: LiveOddsWorkerStatus = {
  connected: true,
  configured: isSportsGameOddsConfigured(),
  workerHealthy: false,
  lastAttemptAt: null,
  lastSuccessAt: null,
};

function emitStatus(io: LiveOddsSocketServer) {
  io.emit("sportsbook:status", workerStatus);
}

async function emitLatestSnapshot(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
) {
  try {
    const snapshot = await readLiveOddsSnapshot(isSportsGameOddsConfigured());
    socket.emit("sportsbook:odds:update", snapshot);
  } catch (error) {
    logger.warn({ error }, "Live odds cache unavailable for socket subscriber");
    socket.emit(
      "sportsbook:odds:update",
      emptyLiveOddsSnapshot(isSportsGameOddsConfigured()),
    );
  }
}

export function createLiveOddsSocketServer(
  httpServer: HttpServer,
  allowedOrigins: string[],
): LiveOddsSocketServer {
  const io = new SocketServer<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      path: "/socket.io",
      cors: {
        origin: allowedOrigins,
        credentials: true,
        methods: ["GET", "POST"],
      },
      transports: ["websocket", "polling"],
      pingInterval: 25_000,
      pingTimeout: 20_000,
    },
  );

  io.on("connection", (socket) => {
    socket.emit("sportsbook:status", workerStatus);
    void emitLatestSnapshot(socket);
    socket.on("sportsbook:subscribe", () => {
      socket.emit("sportsbook:status", workerStatus);
      void emitLatestSnapshot(socket);
    });
  });

  logger.info("Socket.IO live sportsbook transport initialized");
  return io;
}

export async function syncLiveOddsOnce(
  io?: LiveOddsSocketServer,
): Promise<LiveOddsSnapshot | null> {
  const configured = isSportsGameOddsConfigured();
  workerStatus = {
    ...workerStatus,
    configured,
    lastAttemptAt: new Date().toISOString(),
  };

  if (!configured) {
    workerStatus = {
      ...workerStatus,
      workerHealthy: false,
      message: "SPORTS_GAME_ODDS_API_KEY is not configured",
    };
    if (io) emitStatus(io);
    logger.warn(
      "Live odds worker disabled: SportsGameOdds API key is not configured",
    );
    return null;
  }

  try {
    const snapshot = await withLiveOddsSyncLock(async () => {
      const fixtures = await fetchAllLiveEvents();
      return writeLiveOddsSnapshot(fixtures, new Date(), true);
    });

    if (!snapshot) {
      logger.debug(
        "Live odds synchronization skipped: another process owns the advisory lock",
      );
      return null;
    }

    workerStatus = {
      connected: true,
      configured: true,
      workerHealthy: true,
      lastAttemptAt: workerStatus.lastAttemptAt,
      lastSuccessAt: snapshot.sourceUpdatedAt,
    };
    if (io) {
      io.emit("sportsbook:odds:update", snapshot);
      emitStatus(io);
    }
    logger.info(
      { fixtureCount: snapshot.fixtures.length, version: snapshot.version },
      "Live odds snapshot synchronized",
    );
    return snapshot;
  } catch (error) {
    workerStatus = {
      ...workerStatus,
      workerHealthy: false,
      message:
        error instanceof Error
          ? error.message
          : "Live odds synchronization failed",
    };
    if (io) emitStatus(io);
    logger.error(
      { error },
      "Live odds synchronization failed; retaining prior snapshot",
    );
    return null;
  }
}

export function startLiveOddsWorker(io: LiveOddsSocketServer): () => void {
  let running = false;
  let stopped = false;

  const run = async () => {
    if (running || stopped) return;
    running = true;
    try {
      await syncLiveOddsOnce(io);
    } finally {
      running = false;
    }
  };

  void run();
  const interval = setInterval(() => void run(), LIVE_ODDS_INTERVAL_MS);
  interval.unref();

  logger.info(
    { intervalMs: LIVE_ODDS_INTERVAL_MS },
    "Live odds worker started",
  );
  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
