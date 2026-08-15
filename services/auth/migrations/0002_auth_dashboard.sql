CREATE TABLE dashboardBootstrap (
  digest TEXT NOT NULL PRIMARY KEY,
  consumedAt INTEGER NOT NULL
);

CREATE TABLE dashboardSuperuser (
  singleton INTEGER NOT NULL PRIMARY KEY CHECK (singleton = 1),
  userId TEXT NOT NULL UNIQUE REFERENCES "user" (id) ON DELETE RESTRICT,
  createdAt INTEGER NOT NULL
);

CREATE TABLE authApi (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  identifier TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE dashboardApplicationApi (
  clientId TEXT NOT NULL PRIMARY KEY REFERENCES oauthClient (clientId) ON DELETE CASCADE,
  apiId TEXT NOT NULL REFERENCES authApi (id) ON DELETE RESTRICT,
  createdAt INTEGER NOT NULL
);

CREATE INDEX dashboardApplicationApi_apiId_idx ON dashboardApplicationApi (apiId);
