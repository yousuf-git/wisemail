import { inngest, priceMigrationRequested } from "@/inngest/client";
import { migratePriceChange } from "@/lib/services/price-migration";

export const priceMigration = inngest.createFunction(
  {
    id: "price-migration",
    triggers: [priceMigrationRequested],
    concurrency: { key: "event.data.priceChangeId", limit: 1 },
    retries: 3,
  },
  async ({ event, step }) => {
    const result = await step.run("migrate", () => migratePriceChange(event.data.priceChangeId));
    if (!result.done) {
      await step.sendEvent("continue", {
        name: priceMigrationRequested.name,
        data: { priceChangeId: event.data.priceChangeId },
      });
    }
    return result;
  },
);
