import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateAiSettingsAction: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/app/(app)/[orgSlug]/settings/ai/actions", () => ({
  updateAiSettingsAction: mocks.updateAiSettingsAction,
}));

import type { AiStatusDTO } from "@/lib/ai/types";
import { AiSettings } from "../ai-settings";
import { useComposeAi } from "../compose-tools";
import { TriageChip, TriageSummary } from "../triage-chip";
import { invalidateAiStatus } from "../use-ai-status";

beforeEach(() => {
  // Radix Switch measures itself.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  invalidateAiStatus();
  vi.clearAllMocks();
});

const status = (over: Partial<AiStatusDTO> = {}): AiStatusDTO => ({
  planIncluded: true,
  enabled: true,
  features: { triage: true, drafts: true, compose: true, anomalies: true },
  canUse: true,
  canConfigure: true,
  planLabel: "Pro",
  nextTierLabel: "Team",
  credits: {
    allowance: 1000,
    used: 120,
    reserved: 0,
    packs: 50,
    available: 930,
    resetsAt: "2026-10-01T00:00:00.000Z",
  },
  ...over,
});

describe("TriageChip", () => {
  it("shows the category, flags urgent mail and carries the summary", () => {
    render(
      <TriageChip
        ai={{
          category: "billing",
          priority: "urgent",
          sentiment: "negative",
          summary: "Charged twice.",
        }}
      />,
    );
    const chip = document.querySelector('[data-slot="ai-chip"]')!;
    expect(chip).toHaveTextContent("Billing");
    expect(chip).toHaveTextContent("Urgent");
    expect(chip.getAttribute("title")).toContain("Charged twice.");
  });

  it("stays quiet for normal priority; the thread summary states priority and tone", () => {
    const ai = {
      category: "support",
      priority: "normal",
      sentiment: "positive",
      summary: "Thanks!",
    } as const;
    const { rerender } = render(<TriageChip ai={ai} />);
    expect(document.querySelector('[data-slot="ai-chip"]')).not.toHaveTextContent("Normal");
    rerender(<TriageSummary ai={ai} />);
    expect(screen.getByTestId("ai-summary")).toHaveTextContent("Normal priority · Positive tone");
  });
});

describe("AiSettings", () => {
  it("Free plan: upsell state without switches, privacy note stays", () => {
    render(
      <AiSettings
        orgSlug="acme"
        status={status({ planIncluded: false, planLabel: "Free" })}
        usage={null}
      />,
    );
    expect(screen.getByTestId("ai-locked")).toBeInTheDocument();
    expect(screen.getByText("AI assist is part of the paid plans")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /see plans/i })).toHaveAttribute(
      "href",
      "/acme/settings/billing",
    );
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByText("What leaves Wisemail")).toBeInTheDocument();
  });

  it("Admin: toggles a feature and saves it; credits and usage are shown", async () => {
    mocks.updateAiSettingsAction.mockResolvedValue({
      ok: true,
      data: {
        enabled: true,
        features: { triage: true, drafts: false, compose: true, anomalies: true },
      },
    });
    render(
      <AiSettings
        orgSlug="acme"
        status={status()}
        usage={{
          periodStart: "2026-09-01T00:00:00.000Z",
          byFeature: {
            triage: { calls: 3, credits: 3 },
            draft: { calls: 1, credits: 5 },
            compose: { calls: 0, credits: 0 },
            anomaly: { calls: 0, credits: 0 },
          },
          rows: [
            {
              id: "1",
              at: "2026-09-29T10:00:00.000Z",
              feature: "draft",
              member: "Sam Support",
              model: "fake-main",
              tokens: 321,
              credits: 5,
            },
          ],
        }}
      />,
    );
    expect(screen.getByRole("meter", { name: /credits used/i })).toBeInTheDocument();
    expect(screen.getByText("930")).toBeInTheDocument();
    expect(screen.getByTestId("ai-usage-table")).toHaveTextContent("Sam Support");

    const drafts = screen.getByRole("switch", { name: /Reply drafts/ });
    expect(drafts).toBeChecked();
    fireEvent.click(drafts);
    expect(drafts).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mocks.updateAiSettingsAction).toHaveBeenCalledWith("acme", {
        enabled: true,
        features: { triage: true, drafts: false, compose: true, anomalies: true },
      }),
    );
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled());
  });

  it("master switch off disables the feature switches; non-admins see them read-only", () => {
    const { rerender } = render(
      <AiSettings orgSlug="acme" status={status({ enabled: false })} usage={null} />,
    );
    for (const s of screen.getAllByRole("switch").slice(1)) expect(s).toBeDisabled();
    rerender(<AiSettings orgSlug="acme" status={status({ canConfigure: false })} usage={null} />);
    expect(screen.getByText(/Only Owners and Admins can change/)).toBeInTheDocument();
    for (const s of screen.getAllByRole("switch")) expect(s).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });
});

function Harness(props: Partial<Parameters<typeof useComposeAi>[0]> = {}) {
  const ai = useComposeAi({
    orgSlug: "acme",
    subject: "Invoice",
    bodyHtml: "<p>i dont recieve teh invoice</p>",
    richMode: true,
    disabled: false,
    onUseSubject: () => undefined,
    onReplaceBody: () => undefined,
    ...props,
  });
  return (
    <div>
      {ai.toolbar}
      {ai.panel}
    </div>
  );
}

function stubFetch(aiStatus: AiStatusDTO, compose?: unknown) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    void init;
    if (String(url).includes("/status")) return Response.json(aiStatus);
    if (String(url).includes("/compose") && compose) return Response.json(compose);
    return Response.json({ error: "internal", message: "nope" }, { status: 500 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("compose AI tools", () => {
  beforeEach(() => invalidateAiStatus());

  it("suggests subjects and applies one only when the member picks it", async () => {
    const fetchMock = stubFetch(status(), {
      kind: "subjects",
      suggestions: ["Invoice missing", "Where is my invoice?", "Invoice follow-up"],
      model: "fake-fast",
    });
    const onUseSubject = vi.fn();
    render(<Harness onUseSubject={onUseSubject} />);
    const button = await screen.findByTestId("ai-subjects");
    await userEvent.click(button);
    expect(await screen.findByText("Where is my invoice?")).toBeInTheDocument();
    expect(onUseSubject).not.toHaveBeenCalled();
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes("/compose"))!;
    expect(JSON.parse((call[1] as RequestInit).body as string)).toMatchObject({
      action: "subjects",
      subject: "Invoice",
    });
    await userEvent.click(screen.getAllByRole("button", { name: /use/i })[1]!);
    expect(onUseSubject).toHaveBeenCalledWith("Where is my invoice?");
    expect(screen.queryByTestId("ai-result")).not.toBeInTheDocument();
  });

  it("shows a rewrite as a preview: Replace applies it, Keep mine discards it", async () => {
    stubFetch(status(), {
      kind: "text",
      html: "<p>Better text.</p>",
      text: "Better text.",
      model: "m",
    });
    const onReplaceBody = vi.fn();
    render(<Harness onReplaceBody={onReplaceBody} />);
    await userEvent.click(await screen.findByTestId("ai-grammar"));
    await waitFor(() => expect(screen.getByText("Better text.")).toBeInTheDocument());
    expect(onReplaceBody).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /keep mine/i }));
    expect(onReplaceBody).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId("ai-shorten"));
    await userEvent.click(await screen.findByRole("button", { name: /replace my draft/i }));
    expect(onReplaceBody).toHaveBeenCalledWith("<p>Better text.</p>");
  });

  it("body tools wait for Rich text; subject ideas do not", async () => {
    stubFetch(status());
    render(<Harness richMode={false} />);
    expect(await screen.findByTestId("ai-shorten")).toBeDisabled();
    expect(screen.getByTestId("ai-grammar")).toBeDisabled();
    expect(screen.getByTestId("ai-rewrite")).toBeDisabled();
    expect(screen.getByTestId("ai-subjects")).toBeEnabled();
  });

  it("Free plan: buttons are visible but locked with the upgrade note", async () => {
    const fetchMock = stubFetch(status({ planIncluded: false, planLabel: "Free" }));
    render(<Harness />);
    const button = await screen.findByTestId("ai-subjects");
    expect(button).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(button);
    expect(await screen.findByText(/part of the paid plans/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /see plans/i })).toHaveAttribute(
      "href",
      "/acme/settings/ai",
    );
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/compose"))).toBe(false);
  });

  it("is absent when AI is off, the feature is off or the role cannot use it", async () => {
    for (const s of [
      status({ enabled: false }),
      status({ features: { triage: true, drafts: true, compose: false, anomalies: true } }),
      status({ canUse: false }),
    ]) {
      invalidateAiStatus();
      stubFetch(s);
      const { container, unmount } = render(<Harness />);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      expect(container.querySelector('[data-testid="ai-subjects"]')).toBeNull();
      unmount();
    }
  });

  it("surfaces the server's friendly error when credits are gone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/status")
          ? Response.json(status())
          : Response.json(
              {
                error: "ai_credits_exhausted",
                message: "Your workspace has used all its AI credits.",
              },
              { status: 402 },
            ),
      ),
    );
    render(<Harness />);
    await userEvent.click(await screen.findByTestId("ai-subjects"));
    expect(await screen.findByRole("alert")).toHaveTextContent("used all its AI credits");
  });
});
