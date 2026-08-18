import { spawnSync } from "node:child_process";

const knownFailedMigration = "20240530213853_create_session_table";

// An earlier SQLite-formatted version of this migration reached production and
// left a failed record in _prisma_migrations. The current migration is valid
// PostgreSQL, so clear only that known failure before retrying the deployment.
const repair = spawnSync(
  "npx",
  ["prisma", "migrate", "resolve", "--rolled-back", knownFailedMigration],
  { encoding: "utf8" },
);

const repairOutput = `${repair.stdout ?? ""}${repair.stderr ?? ""}`;
if (repair.status === 0) {
  console.log(`Recovered failed migration ${knownFailedMigration}.`);
} else if (!repairOutput.includes("P3012")) {
  console.error(repairOutput);
  process.exit(repair.status ?? 1);
}

const deploy = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit" });
process.exit(deploy.status ?? 1);
