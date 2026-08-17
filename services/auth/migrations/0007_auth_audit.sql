CREATE TABLE authAuditEvent (
  id TEXT NOT NULL PRIMARY KEY,
  subjectUserId TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  actorUserId TEXT REFERENCES "user" (id) ON DELETE SET NULL,
  eventType TEXT NOT NULL CHECK (eventType IN (
    'account.signed_up',
    'account.provisioned',
    'login.succeeded',
    'password.changed',
    'two_factor.setup_started',
    'two_factor.enabled',
    'two_factor.disabled',
    'two_factor.setup_reset',
    'two_factor.recovery_codes_regenerated',
    'two_factor.auto_repaired'
  )),
  occurredAt INTEGER NOT NULL
);

CREATE INDEX authAuditEvent_subject_timeline_idx
  ON authAuditEvent (subjectUserId, occurredAt DESC, id DESC);

INSERT INTO authAuditEvent (
  id,
  subjectUserId,
  actorUserId,
  eventType,
  occurredAt
)
SELECT
  'historical-account-created:' || id,
  id,
  NULL,
  'account.provisioned',
  CASE
    WHEN typeof(createdAt) IN ('integer', 'real') THEN CAST(createdAt AS INTEGER)
    ELSE CAST(strftime('%s', createdAt) AS INTEGER) * 1000
  END
FROM "user";
