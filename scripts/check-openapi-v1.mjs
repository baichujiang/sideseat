import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const routeRoot = join(root, "app", "api", "v1");
const specPath = join(root, "openapi", "v1.json");
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const operations = new Set(["get", "post", "put", "patch", "delete"]);

function routeFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

function openApiPath(file) {
  const routeDirectory = relative(join(root, "app"), join(file, ".."));
  return `/${routeDirectory
    .split(sep)
    .map((segment) => segment.replace(/^\[(.+)\]$/, "{$1}"))
    .join("/")}`;
}

const implemented = new Set();
for (const file of routeFiles(routeRoot)) {
  const path = openApiPath(file);
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) {
    implemented.add(`${match[1].toLowerCase()} ${path}`);
  }
}

const documented = new Set();
for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
  for (const method of Object.keys(pathItem)) {
    if (operations.has(method)) documented.add(`${method} ${path}`);
  }
}

const missingFromSpec = [...implemented].filter((operation) => !documented.has(operation));
const missingFromCode = [...documented].filter((operation) => !implemented.has(operation));
if (missingFromSpec.length || missingFromCode.length) {
  if (missingFromSpec.length) console.error("Missing from OpenAPI:", missingFromSpec);
  if (missingFromCode.length) console.error("Missing from route implementation:", missingFromCode);
  process.exit(1);
}

console.log(`OpenAPI v1 matches ${implemented.size} implemented operations.`);
