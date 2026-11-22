import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import type { DecisionRequest } from "@workflow/contracts";
import { DecisionDialog } from "../../app/modules/reviews/DecisionDialog";

const showDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
beforeAll(() =>
{
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement)
    {
        this.open = true;
    } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement)
    {
        this.open = false;
    } });
});
afterAll(() =>
{
    if (showDescriptor) Object.defineProperty(HTMLDialogElement.prototype, "showModal", showDescriptor);
    else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
    if (closeDescriptor) Object.defineProperty(HTMLDialogElement.prototype, "close", closeDescriptor);
    else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
});
interface IHarnessProps { decision?: DecisionRequest["decision"]; onConfirm: () => void; }
function Harness({ decision = "REJECT", onConfirm }: IHarnessProps)
{
    const [reason, setReason] = useState("");
    return <DecisionDialog decision={decision} requestLabel="Synthetic request" stageNumber={1} reason={reason} pending={false} error="" onReason={setReason} onCancel={() => undefined} onConfirm={onConfirm} />;
}
test("Lab 7 dialog retains invalid nine-unit reason and allows correction to ten", () =>
{
    const confirm = vi.fn();
    render(<Harness onConfirm={confirm} />);
    const reason = screen.getByRole("textbox", { name: /Reason/ });
    const button = screen.getByRole("button", { name: "Confirm rejection" });
    fireEvent.change(reason, { target: { value: "123456789" } });
    expect(reason).toHaveValue("123456789");
    expect(reason).toHaveAttribute("aria-invalid", "true");
    expect(reason).toHaveAccessibleDescription(/at least 10 characters/);
    expect(button).toBeDisabled();
    fireEvent.submit(button.closest("form")!);
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.change(reason, { target: { value: " 1234567890 " } });
    expect(reason).toHaveValue(" 1234567890 ");
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(confirm).toHaveBeenCalledOnce();
});
test("Lab 7 dialog uses the trimmed maximum without truncating padded input", () =>
{
    render(<Harness onConfirm={vi.fn()} />);
    const reason = screen.getByRole("textbox", { name: /Reason/ });
    fireEvent.change(reason, { target: { value: ` ${"x".repeat(4000)} ` } });
    expect(reason).toHaveValue(` ${"x".repeat(4000)} `);
    expect(screen.getByRole("button", { name: "Confirm rejection" })).toBeEnabled();
    fireEvent.change(reason, { target: { value: "x".repeat(4001) } });
    expect(screen.getByRole("button", { name: "Confirm rejection" })).toBeDisabled();
});
test("Lab 7 dialog preserves approval without a reason", () =>
{
    const confirm = vi.fn();
    render(<Harness decision="APPROVE" onConfirm={confirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
    expect(confirm).toHaveBeenCalledOnce();
});
