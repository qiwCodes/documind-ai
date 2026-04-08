const VECTOR_NAMESPACE_PREFIX = "project";

export function buildProjectVectorNamespace(projectId: string): string {
  return `${VECTOR_NAMESPACE_PREFIX}:${projectId}`;
}

export function parseProjectIdFromNamespace(namespace: string): string | null {
  if (!namespace.startsWith(`${VECTOR_NAMESPACE_PREFIX}:`)) {
    return null;
  }

  const [, projectId] = namespace.split(":");
  return projectId || null;
}
