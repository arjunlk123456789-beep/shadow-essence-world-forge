import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Studio from "./Studio";

const mocks = vi.hoisted(() => ({
  architectMutate: vi.fn(),
  applyMutate: vi.fn(),
  rejectMutate: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    forge: {
      architectPlan: { useMutation: () => ({ mutate: mocks.architectMutate, isPending: false }) },
      applyArchitectPlan: { useMutation: () => ({ mutate: mocks.applyMutate, isPending: false }) },
      rejectProposal: { useMutation: () => ({ mutate: mocks.rejectMutate, isPending: false }) },
    },
  },
}));

vi.mock("wouter", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a href="/editor">{children}</a> }));

describe("Studio page workflow", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    mocks.architectMutate.mockReset();
    mocks.applyMutate.mockReset();
    mocks.rejectMutate.mockReset();
  });

  it("switches between the five editor modes", () => {
    render(<Studio />);
    expect(screen.getByText("World tools")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Paint/i })[0]!);
    expect(screen.getByText("Paint tools")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Build/i })[0]!);
    expect(screen.getByText("Build tools")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Scene/i })[0]!);
    expect(screen.getByText("Scene tools")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Logic/i })[0]!);
    expect(screen.getByText("Logic tools")).toBeInTheDocument();
  });

  it("stages an AI proposal and applies it only through the approval action", async () => {
    mocks.architectMutate.mockImplementation((_input, options) => {
      options?.onSuccess?.({ proposalId: 21, status: "pending", plan: { operations: [{ id: "op-1", kind: "paint_terrain", reason: "Create the cursed forest" }] } });
    });
    render(<Studio />);
    fireEvent.change(screen.getByPlaceholderText("Describe a scoped world change..."), { target: { value: "Create a cursed forest around the shrine" } });
    fireEvent.click(screen.getByRole("button", { name: /Generate scoped proposal/i }));
    expect(await screen.findByText("1 operations staged")).toBeInTheDocument();
    expect(mocks.applyMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Apply$/i }));
    expect(mocks.applyMutate).toHaveBeenCalledWith({ id: 21 }, expect.any(Object));
  });

  it("rejects a staged proposal without applying it", async () => {
    mocks.architectMutate.mockImplementation((_input, options) => {
      options?.onSuccess?.({ proposalId: 22, status: "pending", plan: { operations: [{ id: "op-2", kind: "add_lore", reason: "Add shrine history" }] } });
    });
    render(<Studio />);
    fireEvent.change(screen.getByPlaceholderText("Describe a scoped world change..."), { target: { value: "Add the shrine history to the world bible" } });
    fireEvent.click(screen.getByRole("button", { name: /Generate scoped proposal/i }));
    expect(await screen.findByText("1 operations staged")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Reject$/i }));
    expect(mocks.rejectMutate).toHaveBeenCalledWith({ id: 22 }, expect.any(Object));
    expect(mocks.applyMutate).not.toHaveBeenCalled();
  });

  it("records a draft save in the visible Studio timeline", async () => {
    render(<Studio />);
    expect(screen.getByText("Loaded Verdant Reach blueprint")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save draft/i }));
    await waitFor(() => expect(screen.getByText("Saved studio draft")).toBeInTheDocument());
  });
});
