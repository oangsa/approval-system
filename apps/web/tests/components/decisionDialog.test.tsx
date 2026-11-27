import { useState } from "react";
import userEvent from "@testing-library/user-event";
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

test("RR-AC-09 return requires a correction reason and explains restarted review", () =>
{
    const confirm = vi.fn();
    render(<Harness decision="RETURN" onConfirm={confirm} />);
    const button = screen.getByRole("button", { name: "Confirm return" });
    expect(button).toBeDisabled();
    expect(screen.getByText(/Resubmission restarts review/)).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: /Reason/ }), { target: { value: "Fix" } });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(confirm).toHaveBeenCalledOnce();
});

test("return dialog keyboard flow retains reason through recoverable error and native cancel", async () =>
{
    function Controlled()
    {
        const [open, setOpen] = useState(false);
        const [reason, setReason] = useState("");
        const [error, setError] = useState("");
        return <><button onClick={() => setOpen(true)}>Open return</button>{open && <DecisionDialog decision="RETURN" requestLabel="Request" stageNumber={1} reason={reason} pending={false} error={error} onReason={setReason} onCancel={() => setOpen(false)} onConfirm={() => setError("Temporary failure")} />}</>;
    }
    const user = userEvent.setup();
    render(<Controlled />);
    const trigger = screen.getByRole("button", { name: "Open return" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const reason = screen.getByRole("textbox", { name: /Reason/ });
    expect(reason).toHaveFocus();
    await user.type(reason, "   ");
    expect(screen.getByRole("button", { name: "Confirm return" })).toBeDisabled();
    await user.type(reason, "Please correct");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Temporary failure");
    expect(reason).toHaveValue("   Please correct");
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: /Reason/ })).toHaveValue("   Please correct");
});

test.each(["APPROVE", "REJECT"] as const)("%s restores focus and blocks pending actions", async (decision) =>
{
    const confirm = vi.fn();
    function Controlled()
    {
        const [open, setOpen] = useState(false);
        const [pending, setPending] = useState(false);
        return <><button onClick={() => setOpen(true)}>Open</button><button onClick={() => setPending(true)}>Set pending</button>{open && <DecisionDialog decision={decision} requestLabel="Request" stageNumber={1} reason="Valid reason" pending={pending} error="" onReason={() => undefined} onCancel={() => setOpen(false)} onConfirm={confirm} />}</>;
    }
    const user = userEvent.setup();
    render(<Controlled />);
    const trigger = screen.getByRole("button", { name: "Open" });
    await user.click(trigger);
    expect(screen.getByRole("textbox", { name: /Reason/ })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Set pending" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(confirm).not.toHaveBeenCalled();
});
