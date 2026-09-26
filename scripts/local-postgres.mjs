/**
 * Local development fallback when Docker is unavailable: runs a real PostgreSQL server
 * (npm "embedded-postgres" ships the official PostgreSQL binaries) on localhost:5432.
 * Same credentials as docker-compose.yml. Data lives in ./.pgdata (git-ignored).
 *
 *   node scripts/local-postgres.mjs        # start (Ctrl+C to stop)
 */
import fs from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const dataDir = path.resolve(".pgdata");
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "bonita",
  password: "bonita",
  port: 5432,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

const fresh = !fs.existsSync(path.join(dataDir, "PG_VERSION"));
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase("bonita");
console.log("PostgreSQL ready on postgresql://bonita:bonita@localhost:5432/bonita");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
