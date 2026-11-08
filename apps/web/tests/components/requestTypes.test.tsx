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
    expect(screen.getByRole("textbox", { name: "Title (required)" })).toBeVisible();
});

test.each([undefined, "bad-json", "{}"])("request-type API rejects missing/malformed pagination: %s", async (pagination) =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    server.use(http.post("http://localhost/api/v1/request-types/search", () => HttpResponse.json([], { headers: pagination ? { "X-Pagination": pagination } : {} })));
    await expect(requestApi.types()).rejects.toBeDefined();
});
