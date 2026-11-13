import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import type { SessionStatus } from "../../app/modules/auth/sessionContext";
import Home, { meta } from "../../app/routes/home";

const session = vi.hoisted(() => ({ status: "idle" as SessionStatus }));
vi.mock("../../app/modules/auth/sessionContext", () => ({ useSession: () => session }));
beforeEach(() =>
{
    session.status = "idle";
});

test("public landing explains the workflow with working sign-in and overview destinations", () =>
{
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1, name: "Keep every request moving." })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in to workspace" })).toHaveAttribute("href", "/auth/login");
    expect(screen.getByRole("link", { name: "See how it works" })).toHaveAttribute("href", "#how-it-works");
    expect(document.getElementById("how-it-works")).toHaveAccessibleName("Less chasing. More clarity.");
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("figure")).toHaveAccessibleName("A request, from start to finish Illustrative example");
    expect(screen.getByRole("list", { name: "Example request progress" })).toBeVisible();
    expect(screen.queryByText(/Lab 5 release/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("an authenticated client session goes straight to its dashboard", async () =>
{
    session.status = "authenticated";
    render(<MemoryRouter initialEntries={["/"]}><Routes><Route path="/" element={<Home />} /><Route path="/dashboard" element={<h1>Dashboard</h1>} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeVisible();
    expect(screen.queryByText("Equipment purchase")).not.toBeInTheDocument();
});

test("public metadata describes the product instead of the release milestone", () =>
{
    expect(meta()).toContainEqual({ title: "Workflow and Approval System" });
    expect(meta()).toContainEqual(expect.objectContaining({ name: "description", content: expect.stringContaining("approval workspace") }));
});
