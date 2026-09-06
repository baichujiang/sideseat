import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

const BODYLESS_RESPONSE_STATUSES = new Set(["204", "304"]);
const MUTATION_METHODS = new Set(["post", "put", "patch", "delete"]);
const GENERIC_B_LIGHT_ENVELOPES = new Set(["V2SuccessEnvelope"]);
const SEMANTIC_UNION_SCHEMA_NAME = /(actioncontext|activation|planorigin|routefocus|focus)/i;
const REQUIRED_STRICT_ERRORS = ["401", "403", "500"];
const REQUIRED_STRICT_MUTATION_ERRORS = ["409", "422"];
const STRICT_OPERATION_MANIFEST = new Map([
  [
    "get /api/v1/me/weekly-intents",
    {
      operationId: "getCurrentWeeklyIntent",
      statuses: ["200", "401", "403", "404", "500"],
    },
  ],
  [
    "post /api/v1/me/weekly-intents",
    {
      operationId: "createWeeklyIntent",
      statuses: ["201", "401", "403", "404", "409", "422", "500"],
    },
  ],
  [
    "patch /api/v1/me/weekly-intents/{intentId}",
    {
      operationId: "updateWeeklyIntent",
      statuses: ["200", "401", "403", "404", "409", "422", "500"],
    },
  ],
  [
    "delete /api/v1/me/weekly-intents/{intentId}",
    {
      operationId: "endWeeklyIntent",
      statuses: ["200", "401", "403", "404", "409", "422", "500"],
    },
  ],
  [
    "get /api/v1/me/mutual-opportunities",
    {
      operationId: "listMutualOpportunities",
      statuses: ["200", "401", "403", "404", "500"],
    },
  ],
  [
    "post /api/v1/me/mutual-opportunities/{opportunityId}/decision",
    {
      operationId: "decideMutualOpportunity",
      statuses: ["200", "401", "403", "404", "409", "422", "500"],
    },
  ],
  [
    "delete /api/v1/me/mutual-opportunities/{opportunityId}/decision",
    {
      operationId: "withdrawMutualOpportunityDecision",
      statuses: ["200", "401", "403", "404", "409", "422", "500"],
    },
  ],
  [
    "post /api/v1/discover/posts/{postId}/interest",
    {
      operationId: "expressActionInterest",
      statuses: ["201", "401", "403", "404", "409", "422", "429", "500"],
    },
  ],
  [
    "delete /api/v1/discover/posts/{postId}/interest",
    {
      operationId: "withdrawActionInterest",
      statuses: ["200", "401", "403", "404", "409", "422", "500"],
    },
  ],
  [
    "post /api/v1/action-coordination/v2/actions/{actionId}/interest",
    {
      operationId: "createCreatorGatedActionInterest",
      statuses: [
        "200",
        "201",
        "400",
        "401",
        "403",
        "404",
        "409",
        "422",
        "426",
        "429",
        "500",
      ],
    },
  ],
  [
    "get /api/v1/action-coordination/v2/interests/{interestId}",
    {
      operationId: "getCreatorGatedActionInterest",
      statuses: ["200", "401", "403", "404", "422", "500"],
    },
  ],
  [
    "delete /api/v1/action-coordination/v2/interests/{interestId}",
    {
      operationId: "withdrawCreatorGatedActionInterest",
      statuses: ["200", "401", "403", "404", "409", "422", "500"],
    },
  ],
  [
    "post /api/v1/action-coordination/v2/interests/{interestId}/reactivate",
    {
      operationId: "reactivateCreatorGatedActionInterest",
      statuses: [
        "200",
        "201",
        "400",
        "401",
        "403",
        "404",
        "409",
        "422",
        "426",
        "429",
        "500",
      ],
    },
  ],
  [
    "get /api/v1/action-coordination/v2/me/interests",
    {
      operationId: "listMyCreatorGatedActionInterests",
      statuses: ["200", "401", "403", "422", "500"],
    },
  ],
  [
    "get /api/v1/action-coordination/v2/responses",
    {
      operationId: "listCreatorActionResponses",
      statuses: ["200", "401", "403", "404", "410", "422", "500"],
    },
  ],
  [
    "post /api/v1/action-coordination/v2/actions/{actionId}/responses/seen",
    {
      operationId: "markCreatorActionResponsesSeen",
      statuses: [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "410",
        "422",
        "500",
      ],
    },
  ],
  [
    "patch /api/v1/action-coordination/v2/interests/{interestId}/presentation",
    {
      operationId: "setCreatorActionInterestPresentation",
      statuses: ["200", "400", "401", "403", "404", "409", "422", "500"],
    },
  ],
  [
    "post /api/v1/action-coordination/v2/interests/{interestId}/reservations",
    {
      operationId: "reserveCreatorGatedActionCoordination",
      statuses: [
        "200",
        "201",
        "400",
        "401",
        "403",
        "404",
        "409",
        "422",
        "426",
        "500",
      ],
    },
  ],
  [
    "delete /api/v1/action-coordination/v2/reservations/{reservationId}",
    {
      operationId: "releaseCreatorGatedActionCoordinationReservation",
      statuses: ["200", "400", "401", "403", "404", "409", "422", "500"],
    },
  ],
  [
    "post /api/v1/action-coordination/v2/reservations/{reservationId}/heartbeat",
    {
      operationId: "heartbeatCreatorGatedActionCoordinationReservation",
      statuses: [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "422",
        "426",
        "500",
      ],
    },
  ],
  [
    "post /api/v1/action-coordination/v2/reservations/{reservationId}/activate",
    {
      operationId: "activateCreatorGatedActionCoordination",
      statuses: [
        "201",
        "400",
        "401",
        "403",
        "404",
        "409",
        "422",
        "426",
        "500",
      ],
    },
  ],
  [
    "post /api/v1/action-coordination/v2/contexts/{contextId}/plans",
    {
      operationId: "createCreatorGatedActionPlan",
      statuses: ["201", "400", "401", "403", "404", "409", "422", "500"],
    },
  ],
  [
    "post /api/v1/action-coordination/v2/plans/{revisionId}/counter",
    {
      operationId: "counterCreatorGatedActionPlan",
      statuses: ["201", "400", "401", "403", "404", "409", "422", "500"],
    },
  ],
  [
    "post /api/v1/action-coordination/v2/plans/{revisionId}/accept",
    {
      operationId: "acceptCreatorGatedActionPlan",
      statuses: ["200", "401", "403", "404", "409", "422", "500"],
    },
  ],
  [
    "post /api/v1/action-coordination/v2/plans/{revisionId}/decline",
    {
      operationId: "declineCreatorGatedActionPlan",
      statuses: ["200", "401", "403", "404", "409", "422", "500"],
    },
  ],
  [
    "delete /api/v1/action-coordination/v2/plans/{revisionId}",
    {
      operationId: "withdrawCreatorGatedActionPlan",
      statuses: ["200", "401", "403", "404", "409", "422", "500"],
    },
  ],
]);

function routeFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

function openApiPath(root, file) {
  const routeDirectory = relative(join(root, "app"), dirname(file));
  return `/${routeDirectory
    .split(sep)
    .map((segment) => segment.replace(/^\[(.+)\]$/, "{$1}"))
    .join("/")}`;
}

function findBalancedEnd(source, start, open, close) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === open) depth += 1;
    if (character === close && --depth === 0) return index;
  }
  return -1;
}

function exportedFunctionBody(source, declarationStart) {
  const parametersStart = source.indexOf("(", declarationStart);
  if (parametersStart < 0) return "";
  const parametersEnd = findBalancedEnd(source, parametersStart, "(", ")");
  if (parametersEnd < 0) return "";
  const bodyStart = source.indexOf("{", parametersEnd + 1);
  if (bodyStart < 0) return "";
  const bodyEnd = findBalancedEnd(source, bodyStart, "{", "}");
  return bodyEnd < 0 ? "" : source.slice(bodyStart, bodyEnd + 1);
}

function arrowFunctionBody(source, assignmentEnd) {
  const arrowPrefix = /^\s*(?:async\s*)?\(/.exec(source.slice(assignmentEnd));
  if (!arrowPrefix) return "";
  const parametersStart = assignmentEnd + arrowPrefix[0].lastIndexOf("(");
  const parametersEnd = findBalancedEnd(source, parametersStart, "(", ")");
  if (parametersEnd < 0) return "";
  const arrow = source.indexOf("=>", parametersEnd + 1);
  if (arrow < 0) return "";
  const bodyStart = source.indexOf("{", arrow + 2);
  if (bodyStart < 0) return "";
  const bodyEnd = findBalancedEnd(source, bodyStart, "{", "}");
  return bodyEnd < 0 ? "" : source.slice(bodyStart, bodyEnd + 1);
}

function statusSets(body) {
  const explicitStatuses = new Set(
    [...body.matchAll(/\bstatus\s*:\s*(\d{3})\b/g)].map((status) => status[1]),
  );
  return {
    explicitStatuses,
    explicitSuccessStatuses: new Set(
      [...explicitStatuses].filter((status) => /^2\d{2}$/.test(status)),
    ),
  };
}

export function extractRouteOperations({ root, file, source }) {
  const path = openApiPath(root, file);
  const operations = new Map();
  const add = (method, body = "") => {
    operations.set(method, { method, path, file, ...statusSets(body) });
  };

  const functionDeclaration =
    /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
  for (const match of source.matchAll(functionDeclaration)) {
    add(match[1].toLowerCase(), exportedFunctionBody(source, match.index));
  }

  const directConst =
    /export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\b[^=;\n]*=\s*/g;
  for (const match of source.matchAll(directConst)) {
    const method = match[1].toLowerCase();
    add(method, arrowFunctionBody(source, match.index + match[0].length));
  }

  const exportList = /export\s*\{([^}]+)\}/g;
  for (const match of source.matchAll(exportList)) {
    for (const entry of match[1].split(",")) {
      const parts = entry.trim().split(/\s+as\s+/);
      const localName = parts[0];
      const exportedName = parts[1] ?? parts[0];
      if (!/^(GET|POST|PUT|PATCH|DELETE)$/.test(exportedName)) continue;
      const localConst = new RegExp(
        `(?:const|let)\\s+${localName}\\b[^=;\\n]*=\\s*`,
        "g",
      ).exec(source);
      const localFunction = new RegExp(`function\\s+${localName}\\b`, "g").exec(source);
      const body = localConst
        ? arrowFunctionBody(source, localConst.index + localConst[0].length)
        : localFunction
          ? exportedFunctionBody(source, localFunction.index)
          : "";
      add(exportedName.toLowerCase(), body);
    }
  }

  return [...operations.values()];
}

function resolveLocalRef(spec, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return undefined;
  return ref
    .slice(2)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((value, segment) => value?.[segment], spec);
}

function resolvedObject(spec, value) {
  if (!value?.$ref) return value;
  return resolveLocalRef(spec, value.$ref);
}

function operationLabel(method, path) {
  return `${method.toUpperCase()} ${path}`;
}

function isBLightOperation(path, operation) {
  return (
    operation?.["x-sideseat-contract"] === "b-light-v2" ||
    path.startsWith("/api/v1/action-coordination/v2/") ||
    path === "/api/v1/plan-commitments" ||
    path.startsWith("/api/v1/plan-commitments/") ||
    path === "/api/v1/plans/{planId}/withdraw"
  );
}

function isStrictOperation(path, method, operation, manifest) {
  return (
    Boolean(operation?.["x-sideseat-contract"]) ||
    isBLightOperation(path, operation) ||
    manifest.has(`${method} ${path}`)
  );
}

function hasSchema(mediaType) {
  const schema = mediaType && typeof mediaType === "object" ? mediaType.schema : null;
  return Boolean(
    schema &&
      typeof schema === "object" &&
      !Array.isArray(schema) &&
      Object.keys(schema).length > 0,
  );
}

function allParameters(spec, pathItem, operation) {
  return [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])].map((parameter) =>
    resolvedObject(spec, parameter),
  );
}

function referencedSchemaNames(value, names = new Set(), visited = new Set()) {
  if (!value || typeof value !== "object" || visited.has(value)) return names;
  visited.add(value);
  if (typeof value.$ref === "string" && value.$ref.startsWith("#/components/schemas/")) {
    names.add(value.$ref.slice("#/components/schemas/".length));
  }
  for (const child of Object.values(value)) referencedSchemaNames(child, names, visited);
  return names;
}

function reachableSchemaNodes(spec, operation) {
  const nodes = [];
  const visited = new Set();
  const singleSchemaKeys = new Set([
    "items",
    "contains",
    "not",
    "if",
    "then",
    "else",
    "propertyNames",
    "additionalProperties",
    "unevaluatedProperties",
  ]);
  const schemaArrayKeys = new Set(["oneOf", "anyOf", "allOf", "prefixItems"]);
  const schemaMapKeys = new Set(["properties", "patternProperties", "$defs", "dependentSchemas"]);

  function visit(value, schemaName = null, isSchemaNode = false) {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    nodes.push({ value, schemaName, isSchemaNode });
    if (typeof value.$ref === "string") {
      const resolved = resolveLocalRef(spec, value.$ref);
      const isSchemaRef = value.$ref.startsWith("#/components/schemas/");
      const name = isSchemaRef
        ? value.$ref.slice("#/components/schemas/".length)
        : schemaName;
      visit(resolved, name, isSchemaNode || isSchemaRef);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === "$ref") continue;
      if (!isSchemaNode) {
        visit(child, schemaName, key === "schema");
      } else if (schemaArrayKeys.has(key) && Array.isArray(child)) {
        for (const schema of child) visit(schema, schemaName, true);
      } else if (schemaMapKeys.has(key) && child && typeof child === "object") {
        for (const schema of Object.values(child)) visit(schema, schemaName, true);
      } else if (singleSchemaKeys.has(key) && child && typeof child === "object") {
        visit(child, schemaName, true);
      }
    }
  }

  visit(operation);
  return nodes;
}

function validateDiscriminator(spec, node, label, errors) {
  if (!Array.isArray(node.oneOf)) return;
  const discriminator = node.discriminator;
  if (!discriminator || typeof discriminator.propertyName !== "string" || !discriminator.propertyName) {
    errors.push(`${label}: oneOf polymorphism must declare discriminator.propertyName.`);
    return;
  }
  if (node.oneOf.length < 2) {
    errors.push(`${label}: oneOf polymorphism must contain at least two variants.`);
  }
  const discriminatorValues = new Set();
  for (const [index, variant] of node.oneOf.entries()) {
    const resolved = resolvedObject(spec, variant);
    const property = resolved?.properties?.[discriminator.propertyName];
    const required = resolved?.required?.includes(discriminator.propertyName);
    const fixedValue = property?.const !== undefined || property?.enum?.length === 1;
    if (!required || !fixedValue) {
      errors.push(
        `${label}: oneOf variant ${index + 1} must require discriminator property ` +
          `"${discriminator.propertyName}" with const or a single-value enum.`,
      );
      continue;
    }
    const discriminatorValue = property.const ?? property.enum[0];
    if (discriminatorValues.has(discriminatorValue)) {
      errors.push(
        `${label}: oneOf discriminator value ${JSON.stringify(discriminatorValue)} is duplicated.`,
      );
    }
    discriminatorValues.add(discriminatorValue);
  }
}

function validateStrictOperation(spec, path, method, pathItem, operation, errors) {
  const label = operationLabel(method, path);
  const bLight = isBLightOperation(path, operation);
  const parameters = allParameters(spec, pathItem, operation);

  if (
    !Array.isArray(operation.security) ||
    operation.security.length === 0 ||
    !operation.security.every(
      (requirement) =>
        requirement &&
        Object.keys(requirement).length > 0 &&
        Object.hasOwn(requirement, "bearerAuth"),
    )
  ) {
    errors.push(`${label}: strict operations must require bearerAuth.`);
  }

  if (MUTATION_METHODS.has(method)) {
    const idempotencyKey = parameters.find(
      (parameter) =>
        parameter?.in === "header" && parameter.name?.toLowerCase() === "idempotency-key",
    );
    if (!idempotencyKey?.required || !idempotencyKey.schema) {
      errors.push(`${label}: strict mutations must require a schema-defined Idempotency-Key header.`);
    } else if (
      idempotencyKey.schema.type !== "string" ||
      idempotencyKey.schema.minLength !== 8 ||
      idempotencyKey.schema.maxLength !== 128 ||
      idempotencyKey.schema.pattern !== "^[A-Za-z0-9._:-]{8,128}$"
    ) {
      errors.push(
        `${label}: Idempotency-Key must match the server's 8–128 safe-character contract.`,
      );
    }
    if (!operation.requestBody && operation["x-sideseat-empty-request-body"] !== true) {
      errors.push(
        `${label}: declare requestBody or x-sideseat-empty-request-body: true explicitly.`,
      );
    }
    if (operation.requestBody && operation["x-sideseat-empty-request-body"] === true) {
      errors.push(`${label}: requestBody conflicts with x-sideseat-empty-request-body: true.`);
    }
    if (operation.requestBody) {
      const requestBody = resolvedObject(spec, operation.requestBody);
      if (typeof requestBody?.required !== "boolean") {
        errors.push(`${label}: strict requestBody.required must be explicit.`);
      }
    }
  }

  const reachableNodes = reachableSchemaNodes(spec, operation);
  const referencedNames = referencedSchemaNames(operation);
  for (const { schemaName } of reachableNodes) {
    if (schemaName) referencedNames.add(schemaName);
  }
  if (bLight) {
    for (const name of referencedNames) {
      if (GENERIC_B_LIGHT_ENVELOPES.has(name)) {
        errors.push(`${label}: B-light operations must not reference generic schema ${name}.`);
      }
    }
  }

  const requiredErrors = MUTATION_METHODS.has(method)
    ? [...REQUIRED_STRICT_ERRORS, ...REQUIRED_STRICT_MUTATION_ERRORS]
    : REQUIRED_STRICT_ERRORS;
  for (const status of requiredErrors) {
    if (!operation.responses?.[status]) {
      errors.push(`${label}: strict contract must document ${status}.`);
    }
  }

  for (const { value, schemaName, isSchemaNode } of reachableNodes) {
    if (bLight && Array.isArray(value.anyOf)) {
      errors.push(`${label}: B-light polymorphism must use oneOf with a discriminator, not anyOf.`);
    }
    if (bLight && Array.isArray(value.oneOf)) validateDiscriminator(spec, value, label, errors);
    if (bLight && isSchemaNode && Object.keys(value).length === 0) {
      errors.push(`${label}: B-light schemas must not contain empty unconstrained payloads.`);
    }
    if (
      bLight &&
      isSchemaNode &&
      value.type === "object" &&
      (!value.properties || Object.keys(value.properties).length === 0) &&
      !value.$ref &&
      !value.oneOf &&
      !value.allOf &&
      value.additionalProperties !== false
    ) {
      errors.push(`${label}: B-light schemas must not contain generic object payloads.`);
    }
    if (
      bLight &&
      schemaName &&
      SEMANTIC_UNION_SCHEMA_NAME.test(schemaName) &&
      value.type === "object" &&
      value.additionalProperties === true &&
      !value.properties
    ) {
      errors.push(`${label}: semantic schema ${schemaName} must not be a generic object.`);
    }
  }
}

export function validateOpenApiContract({
  spec,
  routeOperations = [],
  strictOperationManifest = STRICT_OPERATION_MANIFEST,
}) {
  const errors = [];
  const documented = new Map();
  const operationIds = new Map();

  if (!spec || typeof spec !== "object") return ["OpenAPI document must be an object."];
  if (!spec.paths || typeof spec.paths !== "object") errors.push("OpenAPI paths must be an object.");

  function validateRefs(value, location, visited = new Set()) {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (value.$ref !== undefined && !resolveLocalRef(spec, value.$ref)) {
      errors.push(`${location}: unresolved local reference ${String(value.$ref)}.`);
    }
    if (typeof value.$ref === "string" && !value.$ref.startsWith("#/")) {
      errors.push(`${location}: external references are not allowed in the native contract.`);
    }
    for (const [key, child] of Object.entries(value)) {
      validateRefs(child, `${location}.${key}`, visited);
    }
  }
  validateRefs(spec, "openapi");

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    const placeholders = new Set([...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]));
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) continue;
      const label = operationLabel(method, path);
      documented.set(`${method} ${path}`, operation);

      if (
        typeof operation.operationId !== "string" ||
        !/^[a-z][A-Za-z0-9]*$/.test(operation.operationId)
      ) {
        errors.push(`${label}: operationId must be stable lower-camel-case text.`);
      } else if (operationIds.has(operation.operationId)) {
        errors.push(
          `${label}: duplicate operationId ${operation.operationId}; first used by ` +
            `${operationIds.get(operation.operationId)}.`,
        );
      } else {
        operationIds.set(operation.operationId, label);
      }

      const parameters = allParameters(spec, pathItem, operation);
      const parameterKeys = new Set();
      for (const parameter of parameters) {
        if (!parameter || typeof parameter !== "object") {
          errors.push(`${label}: every parameter reference must resolve.`);
          continue;
        }
        const key = `${parameter.in}:${String(parameter.name).toLowerCase()}`;
        if (parameterKeys.has(key)) errors.push(`${label}: duplicate parameter ${key}.`);
        parameterKeys.add(key);
        if (!parameter.schema && !parameter.content) {
          errors.push(`${label}: parameter ${key} must declare a schema or content.`);
        }
        if (parameter.in === "path" && parameter.required !== true) {
          errors.push(`${label}: path parameter ${parameter.name} must be required.`);
        }
      }
      for (const placeholder of placeholders) {
        if (!parameters.some((parameter) => parameter?.in === "path" && parameter.name === placeholder)) {
          errors.push(`${label}: path placeholder {${placeholder}} has no path parameter.`);
        }
      }

      if (!operation.responses || Object.keys(operation.responses).length === 0) {
        errors.push(`${label}: responses must be explicit.`);
      }
      const successStatuses = Object.keys(operation.responses ?? {}).filter((status) =>
        /^2\d{2}$/.test(status),
      );
      if (successStatuses.length === 0) errors.push(`${label}: at least one 2xx response is required.`);

      for (const [status, responseRef] of Object.entries(operation.responses ?? {})) {
        if (!/^(?:[1-5]\d{2}|[1-5]XX|default)$/.test(status)) {
          errors.push(`${label}: invalid response status ${status}.`);
        }
        const response = resolvedObject(spec, responseRef);
        if (!response || typeof response !== "object") {
          errors.push(`${label} ${status}: response reference must resolve.`);
          continue;
        }
        if (typeof response.description !== "string" || !response.description.trim()) {
          errors.push(`${label} ${status}: response description is required.`);
        }
        if (BODYLESS_RESPONSE_STATUSES.has(status)) {
          if (response.content && Object.keys(response.content).length > 0) {
            errors.push(`${label} ${status}: bodyless status must not declare response content.`);
          }
          continue;
        }
        if (!response.content || Object.keys(response.content).length === 0) {
          errors.push(`${label} ${status}: response body content must be explicit.`);
          continue;
        }
        for (const [mediaType, media] of Object.entries(response.content)) {
          if (!hasSchema(media)) errors.push(`${label} ${status}: ${mediaType} must declare a schema.`);
        }
      }

      if (operation.requestBody) {
        const requestBody = resolvedObject(spec, operation.requestBody);
        if (!requestBody?.content || Object.keys(requestBody.content).length === 0) {
          errors.push(`${label}: requestBody content must be explicit.`);
        } else {
          for (const [mediaType, media] of Object.entries(requestBody.content)) {
            if (!hasSchema(media)) errors.push(`${label}: request ${mediaType} must declare a schema.`);
          }
        }
      }

      if (isStrictOperation(path, method, operation, strictOperationManifest)) {
        const frozen = strictOperationManifest.get(`${method} ${path}`);
        if (!frozen) {
          errors.push(`${label}: strict operation must be registered in the checker manifest.`);
        } else {
          if (frozen.operationId !== operation.operationId) {
            errors.push(`${label}: strict operationId must match its frozen operation ID.`);
          }
          const documentedStatuses = Object.keys(operation.responses ?? {}).sort();
          const frozenStatuses = [...frozen.statuses].sort();
          if (JSON.stringify(documentedStatuses) !== JSON.stringify(frozenStatuses)) {
            errors.push(`${label}: response statuses must match its frozen status manifest.`);
          }
        }
        validateStrictOperation(spec, path, method, pathItem, operation, errors);
      }
    }
  }

  const implemented = new Map(
    routeOperations.map((operation) => [`${operation.method} ${operation.path}`, operation]),
  );
  for (const [key, route] of implemented) {
    if (!documented.has(key)) errors.push(`Missing from OpenAPI: ${key}`);
    const documentedOperation = documented.get(key);
    if (!documentedOperation) continue;
    const statuses = documentedOperation.responses ?? {};
    for (const status of route.explicitSuccessStatuses) {
      if (!statuses[status]) {
        errors.push(
          `${operationLabel(route.method, route.path)}: implementation explicitly returns ${status}, ` +
            "but OpenAPI does not document it.",
        );
      }
    }
    if (isStrictOperation(route.path, route.method, documentedOperation, strictOperationManifest)) {
      for (const status of route.explicitStatuses) {
        if (!statuses[status]) {
          errors.push(
            `${operationLabel(route.method, route.path)}: strict implementation explicitly returns ` +
              `${status}, but OpenAPI does not document it.`,
          );
        }
      }
    }
  }
  for (const key of documented.keys()) {
    if (!implemented.has(key)) errors.push(`Missing from route implementation: ${key}`);
  }

  return [...new Set(errors)].sort();
}

export function checkOpenApiProject(root = process.cwd()) {
  const routeRoot = join(root, "app", "api", "v1");
  const specPath = join(root, "openapi", "v1.json");
  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const routeOperations = routeFiles(routeRoot).flatMap((file) =>
    extractRouteOperations({ root, file, source: readFileSync(file, "utf8") }),
  );
  return {
    errors: validateOpenApiContract({ spec, routeOperations }),
    implementedCount: routeOperations.length,
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = checkOpenApiProject();
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(
      `OpenAPI v1 matches ${result.implementedCount} implemented operations and passes contract validation.`,
    );
  }
}
