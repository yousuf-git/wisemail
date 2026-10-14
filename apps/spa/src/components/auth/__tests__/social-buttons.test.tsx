import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const social = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/client", () => ({ authClient: { signIn: { social } } }));

import { SocialButtons } from "../social-buttons";

afterEach(() => {
  cleanup();
  social.mockReset();
});

describe("SocialButtons", () => {
  it("renders nothing when no provider is enabled", () => {
    const { container } = render(<SocialButtons providers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders only the enabled providers", () => {
    render(<SocialButtons providers={["github"]} />);
    expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Google/ })).toBeNull();
  });

  it("starts the provider flow toward a safe next path", async () => {
    social.mockResolvedValue({ error: null });
    render(<SocialButtons providers={["google", "github"]} next="//evil.example" />);
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(social).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/onboarding",
      errorCallbackURL: "/sign-in",
    });
  });

  it("explains a failed start", async () => {
    social.mockResolvedValue({ error: { message: "nope" } });
    render(<SocialButtons providers={["google"]} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/couldn't reach Google/),
    );
  });
});
