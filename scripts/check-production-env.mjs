const required = ["DATABASE_URL", "SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "SHOPIFY_APP_URL", "SCOPES"];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Missing required production environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const r2 = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];
const configuredR2 = r2.filter((name) => process.env[name]?.trim());
if (configuredR2.length > 0 && configuredR2.length < r2.length) {
  console.error(`Cloudflare R2 configuration is incomplete. Missing: ${r2.filter((name) => !process.env[name]?.trim()).join(", ")}`);
  process.exit(1);
}

console.log("Production environment validation passed.");
