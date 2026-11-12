import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { MemoryRouter } from "react-router";
import Home from "../../app/routes/home";

test("starter page exposes its content with semantic markup", () =>
{
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Workflow and Approval System" })).toBeVisible();
    expect(screen.getByText("Lab 5 release · Sprint 1 approval workflow")).toBeVisible();
});
