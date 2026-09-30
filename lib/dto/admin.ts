/** DTOs for the platform admin panel (plain, serializable). */

export type AdminOverviewDTO = {
  counts: {
    users: number;
    organizations: number;
    activeConnections: number;
    needsAttentionConnections: number;
    eventsLast24h: number;
    failedSyncRuns24h: number;
    failedEvents24h: number;
    signupsLast7d: number;
  };
  plans: { plan: string; label: string; count: number }[];
  trialing: number;
  suspended: number;
  recentSignups: AdminUserRowDTO[];
};

export type AdminUserRowDTO = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string;
  isAdmin: boolean;
  banned: boolean;
  createdAt: string;
  orgCount: number;
};

export type AdminPageDTO<T> = { items: T[]; nextCursor: string | null };

export type AdminUserDetailDTO = AdminUserRowDTO & {
  banReason: string | null;
  banExpires: string | null;
  image: string | null;
  providers: string[];
  memberships: {
    orgId: string;
    orgName: string;
    orgSlug: string;
    role: string;
    joinedAt: string;
  }[];
  sessions: { active: number; lastSeenAt: string | null; lastCreatedAt: string | null };
};

export type AdminOrgRowDTO = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  planLabel: string;
  planState: string;
  suspended: boolean;
  createdAt: string;
  members: number;
  connections: number;
  trackedThisPeriod: number;
};

export type AdminLimitRowDTO = {
  key: string;
  label: string;
  effective: number | null;
  catalog: number | null;
  override: number | null;
};

export type AdminOrgDetailDTO = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  plan: string;
  storedPlan: string;
  planLabel: string;
  planState: string;
  trial: { startedAt: string; endsAt: string; active: boolean; daysLeft: number } | null;
  billingEnabled: boolean;
  suspended: { at: string; by: string | null; reason: string } | null;
  limits: AdminLimitRowDTO[];
  members: { userId: string; name: string; email: string; role: string }[];
  connections: {
    id: string;
    name: string;
    status: string;
    statusReason: string | null;
    lastEventAt: string | null;
    lastSyncAt: string | null;
    apiKeyLast4: string | null;
  }[];
  usage: {
    periodStart: string;
    periodEnd: string;
    allowance: number;
    tracked: { transactional: number; broadcast: number; inbound: number; total: number };
  };
  recentAudit: { id: string; at: string; action: string; actor: string; reason: string | null }[];
};

export type AdminHealthDTO = {
  generatedAt: string;
  attention: {
    id: string;
    name: string;
    status: string;
    statusReason: string | null;
    orgId: string;
    orgName: string;
    updatedAt: string;
    lastEventAt: string | null;
  }[];
  failedSyncs: {
    id: string;
    connectionName: string;
    orgId: string;
    orgName: string;
    stage: string | null;
    error: string | null;
    startedAt: string;
  }[];
  ingest: {
    eventsLastHour: number;
    eventsLast24h: number;
    failedLast24h: number;
    /** Received more than 5 minutes ago and still not processed. */
    backlog: number;
    avgProcessingMs: number | null;
    maxProcessingMs: number | null;
  };
  failedEvents: {
    id: string;
    type: string;
    orgId: string;
    orgName: string;
    error: string;
    receivedAt: string;
  }[];
  inngestUrl: string;
  inngestDev: boolean;
};
