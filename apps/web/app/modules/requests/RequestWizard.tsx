import { useEffect, useRef, useState } from "react";
import { Link, useBeforeUnload, useBlocker } from "react-router";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { applicableFields, createRequestSchema, isPresent, itemTotal, sumAmounts, validateFields, type CreateRequest, type IFieldIssue, type PublishedRequestType, type RequestDetail } from "@workflow/contracts";
import { requestApi } from "~/api/requests";
import { isApiFailure } from "~/api/errors";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ManagedForm } from "~/components/forms/ManagedForm";
import { FieldRenderer, fieldClassName } from "~/components/forms/FieldRenderer";
import { useSession } from "~/modules/auth/sessionContext";
import { RequestEditingSession } from "~/services/requestService";
import { RequestResult } from "./RequestResult";

const baseSteps = ["Request Type", "Basic Information", "Request Details", "Review & Submit"];
export function RequestWizard()
{
    const { user } = useSession();
    const [types, setTypes] = useState<PublishedRequestType[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadVersion, setLoadVersion] = useState(0);
    const [type, setType] = useState<PublishedRequestType | null>(null);
    const [content, setContent] = useState<CreateRequest>({ typeId: "", formDefinitionVersionId: "", title: "", justification: "", priority: "MEDIUM", fields: {}, lineItems: [] });
    const [step, setStep] = useState(0);
    const [issues, setIssues] = useState<IFieldIssue[]>([]);
    const [error, setError] = useState("");
    const [staleForm, setStaleForm] = useState(false);
    const [busy, setBusy] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [savedMessage, setSavedMessage] = useState("");
    const [result, setResult] = useState<RequestDetail | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [focusField, setFocusField] = useState<string | null>(null);
    const session = useRef(new RequestEditingSession());
    const dialog = useRef<HTMLDialogElement>(null);
    const submitButton = useRef<HTMLButtonElement>(null);
    const steps = type?.supportsLineItems ? [...baseSteps.slice(0, 3), "Items & Attachments", baseSteps[3]!] : baseSteps;
    const visible = type ? applicableFields(type.fields, content.fields ?? {}) : [];
    const blocker = useBlocker(dirty && !result);
    useBeforeUnload((event) =>
    {
        if (dirty && !result)
        {
            event.preventDefault();
            event.returnValue = "";
        }
    });
    useEffect(() =>
    {
        if (blocker.state === "blocked")
        {
            if (window.confirm("Leave this request? Unsaved changes will be lost.")) blocker.proceed();
            else blocker.reset();
        }
    }, [blocker]);
    useEffect(() =>
    {
        const controller = new AbortController();
        setLoading(true);
        requestApi.types(controller.signal).then((values) =>
        {
            if (!controller.signal.aborted)
            {
                setTypes(values);
                setError("");
            }
        }).catch((failure: unknown) =>
        {
            if (!controller.signal.aborted) setError(isApiFailure(failure) ? failure.message : "Could not load request types.");
        }).finally(() =>
        {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [loadVersion]);
    useEffect(() =>
    {
        if (focusField)
        {
            document.getElementById(focusField)?.focus();
            setFocusField(null);
        }
    }, [focusField, step]);
    useEffect(() =>
    {
        if (!confirming) return;
        const panel = dialog.current;
        panel?.showModal();
        return () =>
        {
            panel?.close();
            submitButton.current?.focus();
        };
    }, [confirming]);
    function update(changes: Partial<CreateRequest>): void
    {
        setContent((current) => ({ ...current, ...changes }));
        setDirty(true);
        setSavedMessage("");
        setIssues([]);
    }
    function payload(): CreateRequest
    {
        return { ...content, fields: Object.fromEntries(visible.filter((field) => isPresent(content.fields?.[field.key])).map((field) => [field.key, content.fields![field.key]])) };
    }
    function issueStep(field: string): number
    {
        if (field === "typeId" || field === "formDefinitionVersionId") return 0;
        if (field.startsWith("fields.")) return 2;
        if (field.startsWith("lineItems") || field === "monetaryAmount") return type?.supportsLineItems ? 3 : 2;
        return 1;
    }
    function showIssues(values: IFieldIssue[]): boolean
    {
        setIssues(values);
        if (!values.length) return false;
        const first = values[0]!;
        setStep(issueStep(first.field));
        setFocusField(first.field === "lineItems" ? "lineItems" : first.field);
        return true;
    }
    function validate(all: boolean): IFieldIssue[]
    {
        const values = payload();
        const parsed = createRequestSchema.safeParse(values);
        const errors: IFieldIssue[] = parsed.success ? [] : parsed.error.issues.map((issue) => ({ field: issue.path.join("."), code: "VALIDATION_ERROR", message: issue.message }));
        if (!values.title?.trim()) errors.push({ field: "title", code: "REQUIRED", message: "Title is required." });
        if (!values.justification?.trim()) errors.push({ field: "justification", code: "REQUIRED", message: "Justification is required." });
        if (type) errors.push(...validateFields(type, values.fields ?? {}, true));
        if (type?.supportsLineItems && !values.lineItems?.length) errors.push({ field: "lineItems", code: "REQUIRED", message: "Add at least one item." });
        for (const [index, item] of (values.lineItems ?? []).entries())
        {
            if (!item.description.trim()) errors.push({ field: `lineItems.${index}.description`, code: "REQUIRED", message: "Item description is required." });
        }
        if (type?.monetary && !type.supportsLineItems && !values.monetaryAmount) errors.push({ field: "monetaryAmount", code: "REQUIRED", message: "Amount is required." });
        return errors.filter((issue) => all || issueStep(issue.field) === step);
    }
    async function save(submit = false): Promise<void>
    {
        if (!type || busy) return;
        if (submit && showIssues(validate(true))) return;
        setBusy(true);
        setError("");
        try
        {
            const detail = submit ? await session.current.Submit(payload()) : await session.current.Save(payload());
            setDirty(false);
            if (submit)
            {
                setResult(detail);
                setConfirming(false);
            }
            else setSavedMessage("Draft saved. No request number or approval task has been created.");
        }
        catch (failure)
        {
            if (isApiFailure(failure))
            {
                setError(failure.message);
                setStaleForm(failure.code === "FORM_DEFINITION_CHANGED");
                if (failure.details?.length) showIssues(failure.details);
            }
            else if (failure instanceof Error && "issues" in failure) setError("Check the supplied values before saving.");
            else setError("The request could not be completed. Retry with your inputs preserved.");
            setConfirming(false);
        }
        finally
        {
            setBusy(false);
        }
    }
    function selectType(id: string): void
    {
        if (type?.id === id) return;
        if (type && (dirty || session.current.HasSaved()) && !window.confirm("Changing the type starts a new draft and clears incompatible values. Continue?")) return;
        const selected = types.find((item) => item.id === id) ?? null;
        setType(selected);
        session.current = new RequestEditingSession();
        setContent({ typeId: selected?.id ?? "", formDefinitionVersionId: selected?.versionId ?? "", title: "", justification: "", priority: "MEDIUM", fields: Object.fromEntries(selected?.fields.filter((field) => field.defaultValue !== undefined).map((field) => [field.key, field.defaultValue]) ?? []), lineItems: [] });
        setDirty(true);
        setIssues([]);
        setSavedMessage("");
    }
    async function reviewUpdatedForm(): Promise<void>
    {
        if (!type) return;
        setBusy(true);
        try
        {
            const latest = await requestApi.type(type.id);
            setType(latest);
            update({ formDefinitionVersionId: latest.versionId });
            setStaleForm(false);
            setStep(2);
            setError("Review your existing values against the updated form before submitting.");
        }
        catch
        {
            setError("Could not load the updated form. Your inputs are preserved.");
        }
        finally
        {
            setBusy(false);
        }
    }
    const errorFor = (field: string) => issues.find((issue) => issue.field === field)?.message;
    if (!user?.roles.includes("REQUESTER")) return <p role="alert">A Requester role is required to create requests.</p>;
    if (loading) return <p role="status">Loading request types…</p>;
    if (result) return <div className="mx-auto max-w-3xl space-y-6"><h1 className="flex items-center gap-2 text-2xl font-semibold"><CheckCircle2 aria-hidden="true" />Request submitted</h1><RequestResult detail={result} definition={type} /><Link className="underline" to={`/requests/${result.id}`}>Open saved request</Link></div>;
    function basicField(name: "title" | "justification", label: string)
    {
        return <div className="space-y-2"><label htmlFor={name} className="block text-sm font-medium">{label} (required)</label>{name === "title" ? <Input id={name} value={content[name]} onChange={(event) => update({ [name]: event.target.value })} aria-invalid={!!errorFor(name)} aria-describedby={`${name}.error`} /> : <textarea id={name} className={fieldClassName} rows={4} value={content[name]} onChange={(event) => update({ [name]: event.target.value })} aria-invalid={!!errorFor(name)} aria-describedby={`${name}.error`} />}<p id={`${name}.error`} className="text-sm text-destructive">{errorFor(name)}</p></div>;
    }
    return <div className="mx-auto max-w-3xl space-y-6">
        <header><h1 className="text-2xl font-semibold tracking-tight">New request</h1><p className="mt-1 text-sm text-muted-foreground">Prepare your request, review the details, then submit for approval.</p></header>
        <nav aria-label="Request steps"><ol className="flex flex-wrap gap-3 text-sm">{steps.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined} className={index === step ? "font-semibold" : "text-muted-foreground"}>{index + 1}. {label}{index < step ? " — completed" : index === step ? " — current" : ""}</li>)}</ol></nav>
        {error && <div role="alert" className="rounded-md border border-destructive p-4 text-sm"><AlertCircle className="mr-2 inline h-4 w-4" aria-hidden="true" />{error}{staleForm && <Button type="button" disabled={busy} onClick={() => void reviewUpdatedForm()} className="ml-2 underline">Review updated form</Button>}{!types.length && <Button onClick={() => setLoadVersion((value) => value + 1)} className="ml-2 underline">Retry loading</Button>}</div>}
        {savedMessage && <p role="status" className="text-sm">{savedMessage}</p>}
        {issues.length > 0 && <ul role="alert" className="space-y-1 text-sm text-destructive">{issues.map((issue) => <li key={`${issue.field}-${issue.code}`}>{issue.message}</li>)}</ul>}
        <ManagedForm busy={busy} onSubmit={(event) =>
        {
            event.preventDefault();
            if (showIssues(validate(step === steps.length - 1))) return;
            if (step === steps.length - 1) setConfirming(true);
            else setStep((value) => value + 1);
        }}>
            <section className="space-y-5 rounded-lg border bg-card p-4 sm:p-6" aria-label={steps[step]}>
                <h2 className="text-lg font-semibold">{steps[step]}</h2>
                {step === 0 && <><label htmlFor="typeId" className="block text-sm font-medium">Request type (required)</label><select id="typeId" className={fieldClassName} value={type?.id ?? ""} onChange={(event) => selectType(event.target.value)} aria-invalid={!!errorFor("typeId")}><option value="">Choose a published type</option>{types.map((item) => <option key={item.id} value={item.id}>{item.name.en}</option>)}</select>{!types.length && !error && <p>No published request types are available. Contact an administrator.</p>}{type && <p className="text-sm text-muted-foreground">{type.description?.en} · Definition version {type.versionNumber}</p>}</>}
                {step === 1 && <>{basicField("title", "Title")}{basicField("justification", "Justification")}<label htmlFor="priority" className="block text-sm font-medium">Priority</label><select id="priority" className={fieldClassName} value={content.priority} onChange={(event) => update({ priority: event.target.value as CreateRequest["priority"] })}>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((value) => <option key={value}>{value}</option>)}</select><p className="text-sm">Department: {user.department?.name ?? "Not assigned — an administrator must assign your department before submission."}</p></>}
                {step === 2 && <>{visible.map((field) => <FieldRenderer key={field.key} field={field} value={content.fields?.[field.key]} error={errorFor(`fields.${field.key}`)} onChange={(value) => update({ fields: { ...content.fields, [field.key]: value } })} />)}{!visible.length && <p>No additional fields are required.</p>}{type?.monetary && !type.supportsLineItems && <div><label htmlFor="monetaryAmount">Amount (THB, required)</label><Input id="monetaryAmount" inputMode="decimal" value={content.monetaryAmount ?? ""} onChange={(event) => update({ monetaryAmount: event.target.value || null })} aria-invalid={!!errorFor("monetaryAmount")} /></div>}</>}
                {type?.supportsLineItems && step === 3 && <><p className="text-sm text-muted-foreground">Enter item quantities and amounts. Totals are confirmed by the server.</p>{(content.lineItems ?? []).map((item, index) => <div key={index} className="space-y-3 rounded-md border p-4">{(["description", "quantity", "unitAmount"] as const).map((key) => <div key={key}><label htmlFor={`lineItems.${index}.${key}`}>{key === "unitAmount" ? "Unit amount" : key === "quantity" ? "Quantity" : "Description"} (item {index + 1})</label><Input id={`lineItems.${index}.${key}`} value={item[key]} inputMode={key === "description" ? "text" : "decimal"} aria-invalid={!!errorFor(`lineItems.${index}.${key}`)} onChange={(event) => update({ lineItems: content.lineItems!.map((row, itemIndex) => itemIndex === index ? { ...row, [key]: event.target.value } : row) })} /></div>)}<Button type="button" onClick={() => update({ lineItems: content.lineItems!.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 aria-hidden="true" className="mr-2 h-4 w-4" />Remove item {index + 1}</Button></div>)}<Button id="lineItems" type="button" onClick={() => update({ lineItems: [...content.lineItems ?? [], { description: "", quantity: "1", unitAmount: "0.00" }] })}><Plus aria-hidden="true" className="mr-2 h-4 w-4" />Add item</Button></>}
                {step === steps.length - 1 && <div className="space-y-4"><p className="font-medium">{type?.name.en} · Version {type?.versionNumber}</p><dl className="space-y-3"><div><dt className="text-sm text-muted-foreground">Title</dt><dd>{content.title}</dd></div><div><dt className="text-sm text-muted-foreground">Justification</dt><dd className="whitespace-pre-wrap">{content.justification}</dd></div><div><dt className="text-sm text-muted-foreground">Priority / Department</dt><dd>{content.priority} / {user.department?.name ?? "Not assigned"}</dd></div>{visible.map((field) => <div key={field.key}><dt className="text-sm text-muted-foreground">{field.label.en}</dt><dd>{typeof content.fields?.[field.key] === "boolean" ? content.fields[field.key] ? "Yes" : "No" : field.constraints?.options?.find((option) => option.value === content.fields?.[field.key])?.label.en ?? String(content.fields?.[field.key] ?? "—")}</dd></div>)}</dl>{content.lineItems?.map((item, index) => <p key={index}>{item.description} · {item.quantity} × {item.unitAmount}</p>)}{type?.monetary && <p>Total: {type.supportsLineItems ? sumAmounts((content.lineItems ?? []).map((item) => itemTotal(item.quantity, item.unitAmount))) : content.monetaryAmount} THB</p>}<p className="text-sm text-muted-foreground">Submission locks this revision. The server checks the active department, policy and eligible reviewers before assigning a request number.</p></div>}
            </section>
            <div className="flex flex-wrap items-center justify-between gap-3"><Button type="button" disabled={step === 0} onClick={() => setStep((value) => value - 1)}><ChevronLeft aria-hidden="true" className="mr-1 h-4 w-4" />Back</Button><div className="flex flex-wrap gap-3"><Button type="button" disabled={!type} title={!type ? "Select a published type before saving" : undefined} onClick={() => void save()} className="border px-4 py-2">Save Draft</Button><Button ref={submitButton} type="submit" disabled={!type} className="bg-primary px-4 py-2 text-primary-foreground">{busy ? "Saving…" : step === steps.length - 1 ? "Submit request" : "Next"}<ChevronRight aria-hidden="true" className="ml-1 h-4 w-4" /></Button></div></div>
            {!type && <p className="text-sm text-muted-foreground">Select a published request type to enable Save Draft.</p>}
        </ManagedForm>
        {confirming && <dialog ref={dialog} aria-labelledby="confirm-title" onCancel={(event) =>
        {
            event.preventDefault();
            if (!busy) setConfirming(false);
        }} className="fixed inset-0 m-auto w-full max-w-md space-y-5 rounded-lg border bg-background p-6 text-foreground backdrop:bg-black/50"><h2 id="confirm-title" className="text-lg font-semibold">Submit this request?</h2><p className="text-sm">Submitted content becomes read-only. The server will validate routing and assign the official number.</p><div className="flex justify-end gap-3"><Button type="button" disabled={busy} onClick={() => setConfirming(false)}>Keep editing</Button><Button type="button" disabled={busy} className="bg-primary px-4 py-2 text-primary-foreground" onClick={() => void save(true)}>{busy ? "Submitting…" : "Confirm submission"}</Button></div></dialog>}
    </div>;
}
