import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { LineItemsEditor, LineItemsSummary } from "../../app/components/forms/LineItemsEditor";
import { PriorityBadge } from "../../app/components/status/PriorityBadge";

test("LineItemsEditor renders rows, exact decimal subtotals/totals, inline errors, and add/remove actions", async () =>
{
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
        <LineItemsEditor
            locale="en"
            items={[
                { description: "Cable", quantity: "1", unitAmount: "1000.10" },
                { description: "Adapter", quantity: "2", unitAmount: "0.10" },
            ]}
            onChange={onChange}
            errorFor={(field) => field === "lineItems.0.quantity" ? "Invalid quantity" : undefined}
        />,
    );

    expect(screen.getByText("Subtotal: THB 1,000.10")).toBeVisible();
    expect(screen.getByText("Subtotal: THB 0.20")).toBeVisible();
    expect(screen.getByText("Estimated total: THB 1,000.30")).toBeVisible();
    expect(screen.getByLabelText("Quantity (item 1)")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Invalid quantity")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Add item" }));
    expect(onChange).toHaveBeenCalledWith([
        { description: "Cable", quantity: "1", unitAmount: "1000.10" },
        { description: "Adapter", quantity: "2", unitAmount: "0.10" },
        { description: "", quantity: "1", unitAmount: "0.00" },
    ]);

    await user.click(screen.getByRole("button", { name: "Remove item 1" }));
    expect(onChange).toHaveBeenCalledWith([{ description: "Adapter", quantity: "2", unitAmount: "0.10" }]);
});

test("LineItemsSummary and PriorityBadge render locale-aware currency without floating-point precision loss", () =>
{
    const { rerender } = render(
        <div>
            <PriorityBadge priority="URGENT" />
            <LineItemsSummary
                locale="en"
                items={[{ id: "11111111-1111-4111-8111-111111111111", description: "Server item", quantity: "3", unitAmount: "1000.00", totalAmount: "3000.00" }]}
                amount="9007199254740993.07"
                currency="THB"
            />
        </div>,
    );
    expect(screen.getByText("Urgent")).toBeVisible();
    expect(screen.getByText("Server item")).toBeVisible();
    expect(screen.getByText("3 × THB 1,000.00 = THB 3,000.00")).toBeVisible();
    expect(screen.getByText("Total: THB 9,007,199,254,740,993.07")).toBeVisible();

    rerender(
        <LineItemsSummary
            locale="th"
            items={[{ id: "11111111-1111-4111-8111-111111111111", description: "Server item", quantity: "3", unitAmount: "1000.00", totalAmount: "3000.00" }]}
            amount="9007199254740993.07"
            currency="THB"
        />,
    );
    expect(screen.getByText("3 × ฿1,000.00 = ฿3,000.00")).toBeVisible();
    expect(screen.getByText("Total: ฿9,007,199,254,740,993.07")).toBeVisible();
});
