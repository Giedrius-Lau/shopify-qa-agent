import { spawn } from "node:child_process";

const port = "3217";
const server = spawn("npm", ["run", "start"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: port,
    SKIP_SCAN_WORKER: "true",
    SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY || "smoke-test-key",
    SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET || "smoke-test-secret",
    SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL || `http://127.0.0.1:${port}`,
    SCOPES: process.env.SCOPES || "read_themes",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
server.stdout.on("data", (chunk) => { output += chunk; });
server.stderr.on("data", (chunk) => { output += chunk; });

try {
  let healthy = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (server.exitCode !== null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      const body = await response.json();
      if (response.ok && body.status === "ok") { healthy = true; break; }
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!healthy) throw new Error(`Production server did not become healthy.\n${output}`);
  console.log("Production server smoke test passed.");
} finally {
  server.kill("SIGTERM");
}
