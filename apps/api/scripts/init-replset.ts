import { MongoClient } from "mongodb";

const port = process.env.MONGO_PORT ?? "27017";
const client = new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`, {
  serverSelectionTimeoutMS: 10_000,
});

async function main() {
  await client.connect();
  const admin = client.db("admin");

  try {
    await admin.command({ replSetGetStatus: 1 });
    console.log("replica set rs0 already initiated");
  } catch (error) {
    const code = (error as { codeName?: string }).codeName;
    if (code !== "NotYetInitialized") throw error;
    await admin.command({
      replSetInitiate: { _id: "rs0", members: [{ _id: 0, host: `127.0.0.1:${port}` }] },
    });
    console.log("replica set rs0 initiated");
  }

  for (let i = 0; i < 30; i++) {
    const hello = await admin.command({ hello: 1 });
    if (hello.isWritablePrimary) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("replica set did not elect a primary in time");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => client.close());
