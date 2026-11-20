import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { http, HttpResponse } from "msw";
import { expect, test, vi } from "vitest";
import type { PublishedRequestType } from "@workflow/contracts";
import { RequestWizard } from "../../app/modules/requests/RequestWizard";
import { requestApi } from "../../app/api/requests";
import { server } from "../helpers/server";

vi.mock("../../app/modules/auth/sessionContext", () => ({ useSession: () => ({ user: { roles: ["REQUESTER"] } }) }));
const types: PublishedRequestType[] = Array.from({ length: 101 }, (_, index) => ({
    id: `7bb91ef4-5982-405f-8bd5-${String(index).padStart(12, "0")}`, code: `TYPE-${index}`, name: { en: `Type ${index + 1}` },
    versionId: "8bb91ef4-5982-405f-8bd5-61b5c3cf410b", versionNumber: 1, isEnabled: true, supportsLineItems: false, monetary: false, publishedAt: "2026-11-06T00:00:00Z", fields: [],
}));

test("wizard can select type 101 and preserves that selection when paging back", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    const pages: number[] = [];
    server.use(http.post("http://localhost/api/v1/request-types/search", async ({ request }) =>
    {
        const query = await request.json() as { pageNumber: number; pageSize: number };
        pages.push(query.pageNumber);
        return HttpResponse.json(types.slice((query.pageNumber - 1) * query.pageSize, query.pageNumber * query.pageSize), { headers: { "X-Pagination": JSON.stringify({ currentPage: query.pageNumber, pageSize: 100, totalPages: 2, totalCount: 101, hasPrevious: query.pageNumber > 1, hasNext: query.pageNumber < 2 }) } });
    }));
    const user = userEvent.setup();
    render(<RouterProvider router={createMemoryRouter([{ path: "/", Component: RequestWizard }])} />);
    await user.click(await screen.findByRole("button", { name: "Next types" }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Request type (required)" }), types[100]!.id);
    await user.click(screen.getByRole("button", { name: "Previous types" }));
    expect(await screen.findByRole("combobox", { name: "Request type (required)" })).toHaveValue(types[100]!.id);
    expect(pages).toEqual([1, 2, 1]);
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    expect(screen.getByRole("heading", { name: "Basic Information" })).toHaveFocus();
    const title = screen.getByRole("textbox", { name: "Title (required)" });
    await user.type(title, "Travel request");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Request Type" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    expect(screen.getByRole("textbox", { name: "Title (required)" })).toHaveValue("Travel request");
});

test.each([undefined, "bad-json", "{}"])("request-type API rejects missing/malformed pagination: %s", async (pagination) =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    server.use(http.post("http://localhost/api/v1/request-types/search", () => HttpResponse.json([], { headers: pagination ? { "X-Pagination": pagination } : {} })));
    await expect(requestApi.types()).rejects.toBeDefined();
});

test("BUG-B02 title limit feedback, counter, correction and required validation", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    server.use(http.post("http://localhost/api/v1/request-types/search", () => HttpResponse.json([types[0]], { headers: { "X-Pagination": JSON.stringify({ currentPage: 1, pageSize: 100, totalPages: 1, totalCount: 1, hasPrevious: false, hasNext: false }) } })));
    const user = userEvent.setup();
    render(<RouterProvider router={createMemoryRouter([{ path: "/", Component: RequestWizard }])} />);
    await user.selectOptions(await screen.findByRole("combobox", { name: "Request type (required)" }), types[0]!.id);
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    const title = screen.getByRole("textbox", { name: "Title (required)" });
    await user.type(screen.getByRole("textbox", { name: "Justification (required)" }), "Valid justification");
    await user.click(title);
    await user.paste("W".repeat(201));
    expect(title).toHaveAccessibleDescription(/201 \/ 200 characters/);
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    expect(title).toHaveFocus();
    expect(title).toHaveValue("W".repeat(201));
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAccessibleDescription(/Title must be 200 characters or fewer\./);
    expect(screen.getByRole("alert")).toHaveTextContent("Title must be 200 characters or fewer.");
    expect(screen.getByRole("heading", { name: "Basic Information" })).toBeVisible();
    await user.clear(title);
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    expect(title).toHaveAccessibleDescription(/Title is required\./);
    await user.click(title);
    await user.paste(`  ${"W".repeat(200)}  `);
    expect(title).toHaveAccessibleDescription(/200 \/ 200 characters/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    expect(screen.getByRole("heading", { name: "Request Details" })).toHaveFocus();
});

test.each([false, true])("BUG-B02 Save Draft maps local title errors and focuses owning step (from type step: %s)", async (fromTypeStep) =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    server.use(http.post("http://localhost/api/v1/request-types/search", () => HttpResponse.json([types[0]], { headers: { "X-Pagination": JSON.stringify({ currentPage: 1, pageSize: 100, totalPages: 1, totalCount: 1, hasPrevious: false, hasNext: false }) } })));
    const create = vi.spyOn(requestApi, "create");
    const user = userEvent.setup();
    render(<RouterProvider router={createMemoryRouter([{ path: "/", Component: RequestWizard }])} />);
    await user.selectOptions(await screen.findByRole("combobox", { name: "Request type (required)" }), types[0]!.id);
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    await user.click(screen.getByRole("textbox", { name: "Title (required)" }));
    await user.paste("W".repeat(201));
    if (fromTypeStep) await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Save Draft" }));
    const title = await screen.findByRole("textbox", { name: "Title (required)" });
    expect(title).toHaveFocus();
    expect(title).toHaveValue("W".repeat(201));
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAccessibleDescription(/Title must be 200 characters or fewer\./);
    expect(screen.getByRole("alert")).toHaveTextContent("Title must be 200 characters or fewer.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("required");
    expect(create).not.toHaveBeenCalled();
});
