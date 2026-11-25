import { Plus, Trash2 } from "lucide-react";
import { safeItemTotal, sumAmounts, type RequestRevision } from "@workflow/contracts";
import { ActionButton } from "~/components/actions/ActionButton";
import { Input } from "~/components/ui/input";

export interface IEditableLineItem
{
    description: string;
    quantity: string;
    unitAmount: string;
}

export interface ILineItemsEditorProps
{
    items: IEditableLineItem[];
    onChange(items: IEditableLineItem[]): void;
    errorFor(field: string): string | undefined;
    disabled?: boolean;
}

export function LineItemsEditor({ items, onChange, errorFor, disabled = false }: ILineItemsEditorProps)
{
    const rowTotals = items.map((item) => safeItemTotal(item.quantity, item.unitAmount));
    const validTotals = rowTotals.filter((total): total is string => total !== null);
    const listError = errorFor("lineItems");
    const runningTotal = items.length === 0 ? "0.00" : validTotals.length === items.length ? sumAmounts(validTotals) : null;

    return <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Enter item quantities and amounts. Totals are confirmed by the server.</p>
        {listError && <p id="lineItems.error" className="text-sm text-destructive">{listError}</p>}
        {items.map((item, index) =>
        {
            const rowTotal = rowTotals[index];
            return <div key={index} className="space-y-4 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                        <h3 className="text-sm font-semibold">Item {index + 1}</h3>
                        <p className="text-xs tabular-nums text-muted-foreground">Subtotal: {rowTotal ? `${rowTotal} THB` : "—"}</p>
                    </div>
                    <ActionButton type="button" variant="danger" disabled={disabled} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>
                        <Trash2 aria-hidden="true" className="size-4" />Remove item {index + 1}
                    </ActionButton>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    {(["description", "quantity", "unitAmount"] as const).map((key) =>
                    {
                        const fieldPath = `lineItems.${index}.${key}`;
                        const fieldError = errorFor(fieldPath);
                        const errorId = `${fieldPath}.error`;
                        return <div key={key} className={key === "description" ? "grid gap-2 sm:col-span-2" : "grid gap-2"}>
                            <label className="text-sm font-medium" htmlFor={fieldPath}>{key === "unitAmount" ? "Unit amount" : key === "quantity" ? "Quantity" : "Description"} (item {index + 1})</label>
                            <Input
                                id={fieldPath}
                                value={item[key]}
                                disabled={disabled}
                                inputMode={key === "description" ? "text" : "decimal"}
                                aria-invalid={!!fieldError}
                                aria-describedby={fieldError ? errorId : undefined}
                                onChange={(event) => onChange(items.map((row, itemIndex) => itemIndex === index ? { ...row, [key]: event.target.value } : row))}
                            />
                            {fieldError && <p id={errorId} className="text-sm text-destructive">{fieldError}</p>}
                        </div>;
                    })}
                </div>
            </div>;
        })}
        <div className="flex flex-wrap items-center justify-between gap-3">
            <ActionButton id="lineItems" type="button" disabled={disabled} onClick={() => onChange([...items, { description: "", quantity: "1", unitAmount: "0.00" }])}>
                <Plus aria-hidden="true" className="size-4" />Add item
            </ActionButton>
            <p className="text-sm font-medium tabular-nums">Estimated total: {runningTotal ? `${runningTotal} THB` : "—"}</p>
        </div>
    </div>;
}

export interface ILineItemsSummaryProps
{
    items: RequestRevision["lineItems"];
    amount: string | null;
    currency: string | null;
}

export function LineItemsSummary({ items, amount, currency }: ILineItemsSummaryProps)
{
    return <div className="space-y-3">
        {items.length > 0 && <ul className="divide-y">{items.map((item) => <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2">
            <p className="min-w-0 font-medium">{item.description}</p>
            <p className="text-sm tabular-nums text-muted-foreground">{item.quantity} × {item.unitAmount} = {item.totalAmount}</p>
        </li>)}</ul>}
        {amount !== null && <p className="font-medium tabular-nums">Total: {amount} {currency ?? "THB"}</p>}
    </div>;
}
