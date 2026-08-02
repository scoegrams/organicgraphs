// Local development database bootstrapper.
//
// Runs a REAL PostgreSQL server from the binaries shipped by
// @embedded-postgres/darwin-arm64 — no sudo, no Docker, no system install.
// The server is started as a proper daemon via `pg_ctl` so it SURVIVES this
// script exiting (embedded-postgres' own start() spawns a child that dies with
// its parent, which is no good for a dev DB). Data lives in ./.pgdata.
//
// Usage:
//   node scripts/dev-db.mjs start    # init (if needed) + start daemon
//   node scripts/dev-db.mjs stop     # stop the daemon
//   node scripts/dev-db.mjs ensure   # start only if not already listening
//   node scripts/dev-db.mjs status   # report whether it is listening
//   node scripts/dev-db.mjs reset    # stop + wipe data dir + re-init + start
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import net from "node:net";
import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, ".pgdata");
const LOG_FILE = path.join(DATA_DIR, "server.log");

const PORT = 55432;
const HOST = "127.0.0.1";
const USER = "orggraph";
const PASSWORD = "orggraph";
const DATABASE = "orggraph";

// Resolve the shipped binaries (darwin-arm64 here; extendable per-platform).
// The package restricts its `exports`, so locate it by its node_modules path.
const platformPkg = `${process.platform}-${process.arch}`; // e.g. darwin-arm64
const BIN_DIR = path.join(
  ROOT,
  "node_modules",
  "@embedded-postgres",
  platformPkg,
  "native",
  "bin",
);
const PG_CTL = path.join(BIN_DIR, "pg_ctl");

function portOpen(port = PORT, host = HOST, timeout = 700) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(r);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

async function initCluster() {
  console.log("[dev-db] initializing data directory…");
  const embedded = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
  });
  await embedded.initialise();
}

function pgctl(args) {
  const res = spawnSync(PG_CTL, args, { encoding: "utf8" });
  return res;
}

function startDaemon() {
  // -w waits until startup completes; -o passes runtime options (port).
  const res = pgctl([
    "-D",
    DATA_DIR,
    "-l",
    LOG_FILE,
    "-o",
    `-p ${PORT}`,
    "-w",
    "start",
  ]);
  if (res.status !== 0) {
    throw new Error(
      `pg_ctl start failed (${res.status}): ${res.stderr || res.stdout}`,
    );
  }
}

function stopDaemon() {
  const res = pgctl(["-D", DATA_DIR, "-m", "fast", "-w", "stop"]);
  if (res.status !== 0 && !/does not exist|not running/i.test(res.stderr || "")) {
    console.warn("[dev-db] pg_ctl stop:", (res.stderr || res.stdout).trim());
  }
}

async function ensureAppDb() {
  const client = new pg.Client({
    host: HOST,
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: "postgres",
  });
  await client.connect();
  try {
    const res = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [DATABASE],
    );
    if (res.rowCount === 0) {
      await client.query(`CREATE DATABASE ${DATABASE}`);
      console.log(`[dev-db] created database "${DATABASE}"`);
    }
  } finally {
    await client.end();
  }
}

async function start() {
  if (await portOpen()) {
    console.log(`[dev-db] already listening on ${HOST}:${PORT}`);
    return;
  }
  if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    await initCluster();
  }
  console.log("[dev-db] starting postgres daemon…");
  startDaemon();
  await ensureAppDb();
  console.log(
    `[dev-db] ready on ${HOST}:${PORT} (db=${DATABASE}, user=${USER}) — daemonized, survives this process`,
  );
}

async function stop() {
  if (!(await portOpen())) {
    console.log("[dev-db] not running");
    return;
  }
  console.log("[dev-db] stopping…");
  stopDaemon();
  console.log("[dev-db] stopped");
}

async function ensure() {
  if (await portOpen()) return;
  await start();
}

async function status() {
  console.log((await portOpen()) ? "up" : "down");
}

async function reset() {
  await stop();
  if (existsSync(DATA_DIR)) {
    await rm(DATA_DIR, { recursive: true, force: true });
    console.log("[dev-db] wiped data dir");
  }
  await start();
}

const cmd = process.argv[2] ?? "start";
const actions = { start, stop, ensure, status, reset };
const action = actions[cmd];
if (!action) {
  console.error(
    `Unknown command: ${cmd}. Use: ${Object.keys(actions).join(", ")}`,
  );
  process.exit(1);
}
action()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[dev-db] error:", err.message ?? err);
    process.exit(1);
  });
