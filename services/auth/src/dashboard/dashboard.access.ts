export async function isSuperuserId(
  database: D1Database,
  userId: string,
): Promise<boolean> {
  const row = await database
    .prepare(
      "SELECT userId FROM dashboardSuperuser WHERE singleton = 1 AND userId = ?",
    )
    .bind(userId)
    .first<{ userId: string }>();
  return row !== null;
}

export async function listAudienceIdentifiers(
  database: D1Database,
): Promise<ReadonlyArray<string>> {
  const result = await database
    .prepare("SELECT identifier FROM authApi ORDER BY identifier")
    .all<{ identifier: string }>();
  return result.results.map(({ identifier }) => identifier);
}

function clientIdFromBasicAuthorization(header: string | null): string | null {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(":");
    return separator < 0
      ? null
      : decodeURIComponent(decoded.slice(0, separator));
  } catch {
    return null;
  }
}

function oauthError(description: string): Response {
  return Response.json(
    { error: "invalid_target", error_description: description },
    { headers: { "Cache-Control": "no-store" }, status: 400 },
  );
}

export async function validateTokenAudience(
  request: Request,
  database: D1Database,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (request.method !== "POST" || !url.pathname.endsWith("/oauth2/token")) {
    return undefined;
  }

  const body = await request
    .clone()
    .formData()
    .catch(() => null);
  const resource = body?.get("resource");
  if (typeof resource !== "string" || resource.length === 0) {
    return oauthError("A resource identifying the target API is required.");
  }
  const bodyClientId = body?.get("client_id");
  const clientId =
    typeof bodyClientId === "string" && bodyClientId.length > 0
      ? bodyClientId
      : clientIdFromBasicAuthorization(request.headers.get("authorization"));
  if (!clientId) return oauthError("A client_id is required.");

  const assignment = await database
    .prepare(
      `SELECT link.clientId
       FROM dashboardApplicationApi link
       JOIN authApi api ON api.id = link.apiId
       WHERE link.clientId = ? AND api.identifier = ?`,
    )
    .bind(clientId, resource)
    .first<{ clientId: string }>();
  return assignment
    ? undefined
    : oauthError("This Application is not assigned to the requested API.");
}
