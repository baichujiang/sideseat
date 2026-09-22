export type RouteOperation = {
  method: string;
  path: string;
  file: string;
  explicitStatuses: Set<string>;
  explicitSuccessStatuses: Set<string>;
};

export type StrictOperationManifestEntry = {
  operationId: string;
  statuses: readonly string[];
};

export const HTTP_METHODS: Set<string>;

export function extractRouteOperations(input: {
  root: string;
  file: string;
  source: string;
}): RouteOperation[];

export function validateOpenApiContract(input: {
  spec: unknown;
  routeOperations?: readonly RouteOperation[];
  strictOperationManifest?: ReadonlyMap<string, StrictOperationManifestEntry>;
}): string[];

export function checkOpenApiProject(root?: string): {
  errors: string[];
  implementedCount: number;
};
