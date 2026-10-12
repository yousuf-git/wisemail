import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/mascot/wizi", () => ({
  Wizi: ({ mood }: { mood: string }) => <span data-testid="wizi" data-mood={mood} />,
}));

import { TourContext } from "../tour-context";
import { TourCard } from "../tour-card";
import { TourMenu } from "../tour-menu";
import type { TourStateDTO } from "@/lib/tours/types";

afterEach(cleanup);

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as never;
}
beforeEach(() => mockMatchMedia(false));

const step = {
  title: "Replies land here",
  content: "Conversations show up as they arrive.",
  icon: "wow",
} as never;
const card = (over: Partial<React.ComponentProps<typeof TourCard>> = {}) => {
  const props = {
    step,
    currentStep: 1,
    totalSteps: 4,
    nextStep: vi.fn(),
    prevStep: vi.fn(),
    skipTour: vi.fn(),
    arrow: <i data-testid="arrow" />,
    ...over,
  };
  render(<TourCard {...props} />);
  return props;
};

describe("TourCard", () => {
  it("shows Wizi in the step's mood, the copy, dots, and calls Next / Back / Skip", () => {
    const props = card();
    expect(screen.getByRole("heading", { name: "Replies land here" })).toBeInTheDocument();
    expect(screen.getByText("Conversations show up as they arrive.")).toBeInTheDocument();
    expect(screen.getByTestId("wizi")).toHaveAttribute("data-mood", "wow");
    expect(screen.getByLabelText("Step 2 of 4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
    expect(props.nextStep).toHaveBeenCalledOnce();
    expect(props.prevStep).toHaveBeenCalledOnce();
    expect(props.skipTour).toHaveBeenCalledOnce();
  });

  it("focuses the primary button so the keyboard has a place to land", () => {
    card();
    expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
  });

  it("the last step says Finish; the first step has no Back", () => {
    card({ currentStep: 3 });
    expect(screen.getByRole("button", { name: "Finish" })).toBeInTheDocument();
    cleanup();
    card({ currentStep: 0 });
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("falls back to the idle pose for an unknown mood", () => {
    card({ step: { title: "x", content: "y", icon: "nope" } as never });
    expect(screen.getByTestId("wizi")).toHaveAttribute("data-mood", "idle");
  });

  it("docks as a bottom sheet on small screens, rendered outside the overlay", () => {
    mockMatchMedia(true);
    card();
    const dialog = screen.getByTestId("tour-card");
    expect(dialog.className).toContain("fixed");
    expect(dialog.className).toContain("bottom-3");
    expect(dialog.parentElement).toBe(document.body);
    // No arrow when docked: the card is not anchored to the target.
    expect(screen.queryByTestId("arrow")).toBeNull();
  });
});

describe("TourMenu (Help)", () => {
  const tour = (over: Partial<TourStateDTO> = {}): TourStateDTO => ({
    id: "welcome",
    name: "Welcome to Wisemail",
    description: "A one-minute walk.",
    version: "1.0.0",
    trigger: "auto_first_visit",
    stepIds: ["a", "b"],
    status: null,
    completed: false,
    lastStep: 0,
    outdated: false,
    ...over,
  });

  it("lists tours with completion state and replays on select", async () => {
    const start = vi.fn();
    render(
      <TourContext.Provider
        value={{ tours: [tour({ completed: true, status: "completed" })], start, running: false }}
      >
        <TourMenu />
      </TourContext.Provider>,
    );
    const trigger = screen.getByRole("button", { name: "Help and tours" });
    await userEvent.click(trigger);
    const item = await screen.findByRole("menuitem", { name: /Welcome to Wisemail/ });
    expect(item).toHaveTextContent("Replay");
    expect(item).toHaveTextContent("(completed)");
    fireEvent.click(item);
    expect(start).toHaveBeenCalledWith("welcome");
  });

  it("renders nothing without tours or outside the app shell", () => {
    const { container } = render(<TourMenu />);
    expect(container).toBeEmptyDOMElement();
    cleanup();
    const { container: c2 } = render(
      <TourContext.Provider value={{ tours: [], start: vi.fn(), running: false }}>
        <TourMenu />
      </TourContext.Provider>,
    );
    expect(c2).toBeEmptyDOMElement();
  });
});
