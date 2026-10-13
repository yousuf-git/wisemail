import type { Db, IndexDescription } from "mongodb";

/**
 * Better Auth's MongoDB adapter creates neither collections nor indexes. Creating a collection
 * implicitly inside a transaction makes concurrent first writes fail with a WriteConflict
 * (TransientTransactionError) that the adapter does not retry, and without unique indexes nothing
 * stops two users with the same email. So both are created up front, once per process.
 */
const AUTH_INDEXES: Record<string, IndexDescription[]> = {
  user: [{ key: { email: 1 }, unique: true }],
  session: [{ key: { token: 1 }, unique: true }, { key: { userId: 1 } }],
  account: [{ key: { userId: 1 } }, { key: { providerId: 1, accountId: 1 } }],
  verification: [{ key: { identifier: 1 } }],
  organization: [{ key: { slug: 1 }, unique: true }],
  member: [{ key: { organizationId: 1, userId: 1 }, unique: true }, { key: { userId: 1 } }],
  invitation: [
    { key: { organizationId: 1, email: 1 } },
    {
      key: { tokenHash: 1 },
      unique: true,
      partialFilterExpression: { tokenHash: { $type: "string" } },
    },
  ],
  rateLimit: [{ key: { key: 1 }, unique: true }],
};

export async function ensureAuthCollections(db: Db): Promise<void> {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );
  for (const [name, indexes] of Object.entries(AUTH_INDEXES)) {
    if (!existing.has(name)) {
      await db.createCollection(name).catch((error: { codeName?: string }) => {
        // Another instance created it first.
        if (error.codeName !== "NamespaceExists") throw error;
      });
    }
    await db.collection(name).createIndexes(indexes);
  }
}
