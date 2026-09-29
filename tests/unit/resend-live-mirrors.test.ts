import { afterEach, describe, expect, it, vi } from "vitest";

const ok = <T>(data: T) => ({ data, error: null, headers: {} });

async function adapterWith(sdk: Record<string, unknown>) {
  vi.resetModules();
  vi.doMock("resend", () => ({
    Resend: class {
      constructor() {
        Object.assign(this, sdk);
      }
    },
  }));
  const { LiveResendAdapter } = await import("@/lib/resend/adapter");
  return new LiveResendAdapter("re_x");
}

describe("LiveResendAdapter mirror reads (SDK mocked)", () => {
  afterEach(() => vi.resetModules());

  it("domains: list carries capabilities, get carries records, update maps the toggles", async () => {
    const update = vi.fn(async () => ok({ id: "d1", object: "domain" }));
    const adapter = await adapterWith({
      domains: {
        list: async () =>
          ok({
            object: "list",
            has_more: false,
            data: [
              {
                id: "d1",
                name: "a.com",
                status: "verified",
                region: "us-east-1",
                created_at: "t",
                capabilities: { sending: "enabled", receiving: "disabled" },
                open_tracking: true,
                click_tracking: false,
              },
            ],
          }),
        get: async () =>
          ok({
            id: "d1",
            name: "a.com",
            status: "verified",
            region: "us-east-1",
            created_at: "t",
            capabilities: { sending: "enabled", receiving: "enabled" },
            records: [
              {
                record: "SPF",
                type: "TXT",
                name: "send",
                value: "v=spf1",
                ttl: "Auto",
                status: "verified",
              },
              {
                record: "Receiving",
                type: "MX",
                name: "@",
                value: "mx",
                ttl: "Auto",
                status: "pending",
                priority: 10,
              },
            ],
          }),
        update,
      },
    });
    const list = await adapter.listDomains();
    expect(list.data[0]).toMatchObject({
      capabilities: { sending: true, receiving: false },
      openTracking: true,
      clickTracking: false,
    });
    const detail = await adapter.getDomain("d1");
    expect(detail.capabilities).toEqual({ sending: true, receiving: true });
    expect(detail.records).toEqual([
      expect.objectContaining({ record: "SPF", status: "verified", priority: undefined }),
      expect.objectContaining({ record: "Receiving", type: "MX", priority: 10, status: "pending" }),
    ]);
    await adapter.updateDomain({ id: "d1", openTracking: true });
    expect(update).toHaveBeenCalledWith({ id: "d1", openTracking: true });
    await adapter.updateDomain({ id: "d1", clickTracking: false });
    expect(update).toHaveBeenLastCalledWith({ id: "d1", clickTracking: false });
  });

  it("audience: topics are one page, contacts filter by segment, get flattens properties", async () => {
    const list = vi.fn(async () =>
      ok({
        object: "list",
        has_more: true,
        data: [
          {
            id: "c1",
            email: "a@x.com",
            first_name: null,
            last_name: "L",
            unsubscribed: false,
            created_at: "t",
          },
        ],
      }),
    );
    const topicsList = vi.fn(async () =>
      ok({ data: [{ id: "t1", name: "News", default_subscription: "opt_out", created_at: "t" }] }),
    );
    const adapter = await adapterWith({
      topics: { list: topicsList },
      contacts: {
        list,
        get: async () =>
          ok({
            id: "c1",
            email: "a@x.com",
            first_name: "A",
            last_name: null,
            unsubscribed: true,
            created_at: "t",
            properties: {
              company: { type: "string", value: "Acme" },
              seats: { type: "number", value: 3 },
            },
          }),
        topics: {
          list: async () =>
            ok({
              object: "list",
              has_more: false,
              data: [{ id: "t1", name: "News", description: null, subscription: "opt_in" }],
            }),
        },
      },
    });
    expect(await adapter.listTopics()).toEqual({
      data: [
        expect.objectContaining({ id: "t1", defaultSubscription: "opt_out", description: null }),
      ],
      hasMore: false,
      nextCursor: undefined,
    });
    const page = await adapter.listContacts({ limit: 50, after: "c0", segmentId: "s1" });
    expect(list).toHaveBeenCalledWith({ limit: 50, after: "c0", segmentId: "s1" });
    expect(page).toMatchObject({ hasMore: true, nextCursor: "c1" });
    expect(await adapter.getContact("c1")).toMatchObject({
      unsubscribed: true,
      properties: { company: "Acme", seats: 3 },
    });
    expect(await adapter.listContactTopics("c1")).toMatchObject({
      data: [{ id: "t1", subscription: "opt_in" }],
    });
  });

  it("templates, broadcasts and automations map to our types", async () => {
    const adapter = await adapterWith({
      templates: {
        list: async () =>
          ok({
            object: "list",
            has_more: false,
            data: [
              {
                id: "t1",
                name: "Welcome",
                alias: null,
                status: "published",
                created_at: "a",
                updated_at: "b",
                published_at: null,
              },
            ],
          }),
        get: async () =>
          ok({
            id: "t1",
            name: "Welcome",
            alias: "welcome",
            status: "draft",
            created_at: "a",
            updated_at: "b",
            subject: null,
            from: "x@y.z",
            reply_to: null,
            html: "<p/>",
            text: null,
            variables: [{ key: "NAME", type: "string", fallback_value: "there" }],
          }),
      },
      broadcasts: {
        list: async () =>
          ok({
            object: "list",
            has_more: false,
            data: [
              {
                id: "b1",
                name: "B",
                audience_id: "aud1",
                segment_id: null,
                status: "draft",
                created_at: "t",
                scheduled_at: null,
                sent_at: null,
              },
            ],
          }),
        get: async () =>
          ok({
            id: "b1",
            name: "B",
            audience_id: null,
            segment_id: "s1",
            status: "sent",
            created_at: "t",
            scheduled_at: null,
            sent_at: "u",
            from: "f",
            subject: "s",
            reply_to: null,
            preview_text: "p",
            topic_id: "t1",
            html: "h",
            text: null,
          }),
      },
      automations: {
        list: async () =>
          ok({
            object: "list",
            has_more: false,
            data: [{ id: "a1", name: "A", status: "enabled", created_at: "t", updated_at: null }],
          }),
        get: async () =>
          ok({
            id: "a1",
            name: "A",
            status: "enabled",
            created_at: "t",
            updated_at: null,
            steps: [{ key: "k", type: "trigger", config: { x: 1 } }],
            connections: [{ from: "k", to: "j", type: "default" }],
          }),
      },
    });
    expect((await adapter.listTemplates()).data[0]).toMatchObject({
      alias: null,
      status: "published",
    });
    expect(await adapter.getTemplate("t1")).toMatchObject({
      alias: "welcome",
      subject: null,
      variables: [{ key: "NAME", type: "string", fallbackValue: "there" }],
    });
    // A legacy audience id stands in for the segment id.
    expect((await adapter.listBroadcasts()).data[0]).toMatchObject({ segmentId: "aud1" });
    expect(await adapter.getBroadcast("b1")).toMatchObject({
      segmentId: "s1",
      previewText: "p",
      topicId: "t1",
    });
    expect((await adapter.listAutomations()).data[0]).toMatchObject({
      status: "enabled",
      updatedAt: null,
    });
    expect(await adapter.getAutomation("a1")).toMatchObject({
      steps: [{ key: "k", type: "trigger", config: { x: 1 } }],
      connections: [{ from: "k", to: "j", type: "default" }],
    });
  });

  it("webhook get and SDK errors map to our codes", async () => {
    const adapter = await adapterWith({
      webhooks: {
        get: async () => ({
          data: null,
          error: { name: "not_found", message: "gone", statusCode: 404 },
          headers: {},
        }),
      },
      segments: {
        list: async () => ({
          data: null,
          error: { name: "rate_limit_exceeded", message: "slow", statusCode: 429 },
          headers: { "retry-after": "3" },
        }),
      },
    });
    await expect(adapter.getWebhook("w")).rejects.toMatchObject({ code: "resend_not_found" });
    await expect(adapter.listSegments()).rejects.toMatchObject({
      code: "resend_rate_limited",
      details: { retryAfterSeconds: 3 },
    });
  });
});
