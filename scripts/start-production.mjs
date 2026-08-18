import { spawn } from "node:child_process";
import { createServer } from "node:http";

const port = Number(process.env.PORT || 3000);
const startupServer = createServer((_request, response) => {
  response.writeHead(503, { "content-type": "application/json", "retry-after": "5" });
  response.end(JSON.stringify({ status: "starting", message: "Database migrations are running." }));
});
startupServer.listen(port, "0.0.0.0", () => {
  console.log(`Startup health server listening on port ${port}.`);
});

const migration = spawn("npm", ["run", "db:migrate"], { stdio: "inherit" });
let server;

migration.on("exit", (code) => {
  if (code !== 0) {
    console.error(`Database migration failed with exit code ${code ?? "unknown"}.`);
    startupServer.close(() => process.exit(code ?? 1));
    return;
  }

  startupServer.close(() => {
    console.log("Database migrations completed. Starting application server.");
    server = spawn("npm", ["run", "start"], { stdio: "inherit" });
    server.on("exit", (serverCode, signal) => process.exit(signal ? 1 : serverCode ?? 0));
  });
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    migration.kill(signal);
    server?.kill(signal);
    startupServer.close();
  });
}
