import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const integrationRoot = resolve(repositoryRoot, "integrations/jam-canvas");
await import(resolve(integrationRoot, "hosted/sampla-auth/config.js"));

const config = globalThis.SamplaJamConfig;
const requiredValues = ["apiBaseUrl", "authPageUrl", "firebaseProjectId"];
const missingValues = requiredValues.filter((key) => !config?.[key]);
if (missingValues.length > 0) {
  console.error(`Jam configuration is missing: ${missingValues.join(", ")}`);
  process.exit(1);
}

const authOrigin = new URL(config.authPageUrl).origin;
if (!config.authAllowedOrigins?.includes(authOrigin)) {
  console.error(`authAllowedOrigins must include ${authOrigin}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, "manifest.json"), "utf8"));
const externalMatches = manifest.externally_connectable?.matches || [];
if (!externalMatches.includes(`${authOrigin}/*`)) {
  console.error(`manifest.json externally_connectable.matches must include ${authOrigin}/*`);
  process.exit(1);
}

for (const filename of ["index.html", "auth.js", "auth.css", "config.js"]) {
  if (!existsSync(resolve(integrationRoot, "hosted/sampla-auth", filename))) {
    console.error(`Missing hosted Jam auth file: ${filename}`);
    process.exit(1);
  }
}

if (process.argv.includes("--check")) {
  console.log("Jam integration configuration is valid.");
  process.exit(0);
}

const firebaseApiKey = process.env.SAMPLA_FIREBASE_API_KEY?.trim();
if (!firebaseApiKey) {
  console.error("SAMPLA_FIREBASE_API_KEY must be set for deployment.");
  process.exit(1);
}

const generatedConfigPath = resolve(integrationRoot, "hosted/sampla-auth/firebase-config.js");
writeFileSync(
  generatedConfigPath,
  `globalThis.SamplaFirebaseConfig = Object.freeze(${JSON.stringify({ apiKey: firebaseApiKey })});\n`,
  { mode: 0o600 }
);

console.log(`Deploying Jam phone sign-in to ${config.firebaseProjectId} (${config.authPageUrl})`);
let result;
try {
  result = spawnSync(
    "npx",
    [
      "--yes",
      "firebase-tools@latest",
      "deploy",
      "--only",
      "hosting",
      "--project",
      config.firebaseProjectId,
    ],
    { cwd: repositoryRoot, stdio: "inherit" }
  );
} finally {
  unlinkSync(generatedConfigPath);
}

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
