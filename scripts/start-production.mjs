import { spawn } from "node:child_process";

const server = spawn("npm", ["run", "start"], { stdio: "inherit" });
const migration = spawn("npm", ["run", "db:migrate"], { stdio: "inherit" });
let migrationFinished = false;

migration.on("exit", (code) => {
  migrationFinished = true;
  if (code !== 0) {
    console.error(`Database migration failed with exit code ${code ?? "unknown"}.`);
    server.kill("SIGTERM");
    process.exitCode = code ?? 1;
  }
});

server.on("exit", (code, signal) => {
  if (!migrationFinished) migration.kill("SIGTERM");
  process.exit(signal ? 1 : code ?? 0);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    migration.kill(signal);
    server.kill(signal);
  });
}
