import { ZodError } from "zod";
import { useEffect, useRef, useState } from "react";
import { Link, useBeforeUnload, useBlocker } from "react-router";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { applicableFields, createRequestSchema, isPresent, itemTotal, sumAmounts, validateFields, type IRequestTypeSearchResult, type CreateRequest, type IFieldIssue, type PublishedRequestType, type RequestDetail } from "@workflow/contracts";
import { requestApi } from "~/api/requests";
import { isApiFailure } from "~/api/errors";
import { ActionButton } from "~/components/actions/ActionButton";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ManagedForm } from "~/components/forms/ManagedForm";
import { FieldRenderer, fieldClassName } from "~/components/forms/FieldRenderer";
import { useSession } from "~/modules/auth/sessionContext";
import { RequestEditingSession } from "~/services/requestService";
import { requestPriorityLabel } from "./requestPresentation";
import { RequestResult } from "./RequestResult";

const baseSteps = ["Request Type", "Basic Information", "Request Details", "Review & Submit"];
export function RequestWizard()
{
    const { user } = useSession();
    const [types, setTypes] = useState<PublishedRequestType[]>([]);
    const [pageNumber, setPageNumber] = useState(1);
    const [pagination, setPagination] = useState<IRequestTypeSearchResult["pagination"] | null>(null);
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
    const stepHeading = useRef<HTMLHeadingElement>(null);
    const previousStep = useRef(step);
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
        setTypes([]);
        setPagination(null);
        requestApi.types(pageNumber, controller.signal).then((values) =>
        {
            if (!controller.signal.aborted)
            {
                setTypes(values.items);
                setPagination(values.pagination);
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
    }, [loadVersion, pageNumber]);
    useEffect(() =>
    {
        const changedStep = previousStep.current !== step;
        previousStep.current = step;
        if (focusField)
        {
            (document.getElementById(focusField) ?? stepHeading.current)?.focus();
            setFocusField(null);
        }
        else if (changedStep) stepHeading.current?.focus();
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
            else if (failure instanceof ZodError)
            {
                showIssues(failure.issues.map((issue) => ({ field: issue.path.join("."), code: "VALIDATION_ERROR", message: issue.message })));
            }
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
    if (result) return <div className="mx-auto max-w-3xl space-y-6"><h1 className="flex items-center gap-2 text-2xl font-semibold"><CheckCircle2 aria-hidden="true" />Request submitted</h1><RequestResult detail={result} definition={type} /><Link className="underline" to={`/requests/${result.id}`}>Open saved request</Link></div>;
    function basicField(name: "title" | "justification", label: string)
    {
        return <div className="space-y-2"><label htmlFor={name} className="block text-sm font-medium">{label} (required)</label>{name === "title" ? <Input id={name} value={content[name]} onChange={(event) => update({ [name]: event.target.value })} aria-invalid={!!errorFor(name)} aria-describedby={`${name}.counter ${name}.error`} /> : <textarea id={name} className={fieldClassName} rows={4} value={content[name]} onChange={(event) => update({ [name]: event.target.value })} aria-invalid={!!errorFor(name)} aria-describedby={`${name}.error`} />}{name === "title" && <p id={`${name}.counter`} className="text-sm text-muted-foreground">{(content.title ?? "").trim().length} / 200 characters (excluding leading and trailing spaces)</p>}<p id={`${name}.error`} className="text-sm text-destructive">{errorFor(name)}</p></div>;
    }
    return <div className="mx-auto max-w-5xl space-y-6 sm:space-y-8">
        <header><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">New request</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Prepare your request, review the details, then submit for approval.</p></header>
        <div className="grid items-start gap-5 xl:grid-cols-[14rem_minmax(0,1fr)] xl:gap-8">
            <nav aria-label="Request steps" className="rounded-xl border bg-card p-4">
                <p aria-hidden="true" className="mb-3 text-xs font-medium text-muted-foreground">Step {step + 1} of {steps.length}</p>
                <ol className="flex flex-wrap gap-1 sm:gap-2 xl:flex-col">{steps.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined} className={index === step ? "flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 text-sm font-semibold" : "flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground"}>
                    <span className={index < step ? "flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-xs tabular-nums" : "flex size-6 shrink-0 items-center justify-center rounded-full border bg-background text-xs tabular-nums"}>{index + 1}</span>
                    <span className="sr-only xl:not-sr-only">{label}{index < step ? <span className="sr-only">, completed</span> : null}</span>
                    {index < step && <CheckCircle2 aria-hidden="true" className="hidden size-4 shrink-0 text-primary sm:block" />}
                </li>)}</ol>
            </nav>
            <div className="min-w-0 space-y-4">
                {error && <div role="alert" className="rounded-md border border-destructive p-4 text-sm"><AlertCircle className="mr-2 inline h-4 w-4" aria-hidden="true" />{error}{staleForm && <Button type="button" disabled={busy} onClick={() => void reviewUpdatedForm()} className="ml-2 underline">Review updated form</Button>}{!types.length && <Button onClick={() => setLoadVersion((value) => value + 1)} className="ml-2 underline">Retry loading</Button>}</div>}
                {savedMessage && <p role="status" className="text-sm">{savedMessage}</p>}
                {issues.length > 0 && <ul role="alert" className="space-y-1 text-sm text-destructive">{issues.map((issue) => <li key={`${issue.field}-${issue.code}`}>{issue.message}</li>)}</ul>}
                <ManagedForm busy={busy || loading} onSubmit={(event) =>
                {
                    event.preventDefault();
                    if (showIssues(validate(step === steps.length - 1))) return;
                    if (step === steps.length - 1) setConfirming(true);
                    else setStep((value) => value + 1);
                }}>
                    <section className="space-y-6 rounded-xl border bg-card p-5 sm:p-8" aria-labelledby="request-step-heading">
                        <h2 id="request-step-heading" ref={stepHeading} tabIndex={-1} className="text-xl font-semibold tracking-tight">{steps[step]}</h2>
                        {loading ? <div role="status" className="flex min-h-32 items-center justify-center gap-3 text-sm text-muted-foreground">
                            <LoaderCircle aria-hidden="true" className="size-5 text-primary motion-safe:animate-spin" />Loading request types…
                        </div> : <>
                            {step === 0 && <>
                                <div className="grid gap-2">
                                    <label htmlFor="typeId" className="text-sm font-medium">Request type (required)</label>
                                    <select id="typeId" className={fieldClassName} value={type?.id ?? ""} onChange={(event) => selectType(event.target.value)} aria-invalid={!!errorFor("typeId")}>
                                        <option value="">Choose a published type</option>
                                        {type && !types.some((item) => item.id === type.id) && <option value={type.id}>{type.name.en}</option>}
                                        {types.map((item) => <option key={item.id} value={item.id}>{item.name.en}</option>)}
                                    </select>
                                    {type && <div className="space-y-1 pt-1 text-sm text-muted-foreground">
                                        {type.description?.en && <p>{type.description.en}</p>}
                                        <p>Definition version {type.versionNumber}</p>
                                    </div>}
                                </div>
                                {pagination && pagination.totalPages > 1 && <nav aria-label="Request type pages" className="flex flex-wrap items-center gap-2 border-t pt-4 text-sm">
                                    <ActionButton type="button" disabled={!pagination.hasPrevious} onClick={() => setPageNumber((value) => value - 1)}>Previous types</ActionButton>
                                    <span className="text-muted-foreground">Page {pagination.currentPage} of {pagination.totalPages}</span>
                                    <ActionButton type="button" disabled={!pagination.hasNext} onClick={() => setPageNumber((value) => value + 1)}>Next types</ActionButton>
                                </nav>}
                                {!types.length && !error && <p className="text-sm text-muted-foreground">No published request types are available. Contact an administrator.</p>}
                            </>}
                            {step === 1 && <>
                                {basicField("title", "Title")}
                                {basicField("justification", "Justification")}
                                <div className="grid gap-5 border-t pt-5 sm:grid-cols-2">
                                    <div className="grid content-start gap-2">
                                        <label htmlFor="priority" className="text-sm font-medium">Priority</label>
                                        <select id="priority" className={fieldClassName} value={content.priority} onChange={(event) => update({ priority: event.target.value as CreateRequest["priority"] })}>
                                            {(["LOW", "MEDIUM", "HIGH", "URGENT"] as const).map((value) => <option key={value} value={value}>{requestPriorityLabel(value)}</option>)}
                                        </select>
                                    </div>
                                    <dl className="space-y-2">
                                        <dt className="text-sm font-medium">Department</dt>
                                        <dd className="text-sm text-muted-foreground">{user.department?.name ?? "An administrator must assign your department before submission."}</dd>
                                    </dl>
                                </div>
                            </>}
                            {step === 2 && <>
                                {visible.map((field) => <FieldRenderer key={field.key} field={field} value={content.fields?.[field.key]} error={errorFor(`fields.${field.key}`)} onChange={(value) => update({ fields: { ...content.fields, [field.key]: value } })} />)}
                                {type?.monetary && !type.supportsLineItems ? <div className="grid gap-2">
                                    <label htmlFor="monetaryAmount" className="text-sm font-medium">Amount (THB, required)</label>
                                    <Input id="monetaryAmount" inputMode="decimal" value={content.monetaryAmount ?? ""} onChange={(event) => update({ monetaryAmount: event.target.value || null })} aria-invalid={!!errorFor("monetaryAmount")} />
                                </div> : !visible.length && <p className="text-sm text-muted-foreground">No additional fields are required.</p>}
                            </>}
                            {type?.supportsLineItems && step === 3 && <>
                                <p className="text-sm text-muted-foreground">Enter item quantities and amounts. Totals are confirmed by the server.</p>
                                {(content.lineItems ?? []).map((item, index) => <div key={index} className="space-y-4 rounded-lg border p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <h3 className="text-sm font-semibold">Item {index + 1}</h3>
                                        <ActionButton type="button" variant="danger" onClick={() => update({ lineItems: content.lineItems!.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 aria-hidden="true" className="size-4" />Remove item {index + 1}</ActionButton>
                                    </div>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        {(["description", "quantity", "unitAmount"] as const).map((key) => <div key={key} className={key === "description" ? "grid gap-2 sm:col-span-2" : "grid gap-2"}>
                                            <label className="text-sm font-medium" htmlFor={`lineItems.${index}.${key}`}>{key === "unitAmount" ? "Unit amount" : key === "quantity" ? "Quantity" : "Description"} (item {index + 1})</label>
                                            <Input id={`lineItems.${index}.${key}`} value={item[key]} inputMode={key === "description" ? "text" : "decimal"} aria-invalid={!!errorFor(`lineItems.${index}.${key}`)} onChange={(event) => update({ lineItems: content.lineItems!.map((row, itemIndex) => itemIndex === index ? { ...row, [key]: event.target.value } : row) })} />
                                        </div>)}
                                    </div>
                                </div>)}
                                <ActionButton id="lineItems" type="button" onClick={() => update({ lineItems: [...content.lineItems ?? [], { description: "", quantity: "1", unitAmount: "0.00" }] })}><Plus aria-hidden="true" className="size-4" />Add item</ActionButton>
                            </>}
                            {step === steps.length - 1 && <div className="space-y-5 wrap-anywhere">
                                <p className="text-sm text-muted-foreground">{type?.name.en} · Version {type?.versionNumber}</p>
                                <dl className="grid gap-4 sm:grid-cols-2 [&_dt]:text-sm [&_dt]:text-muted-foreground">
                                    <div className="sm:col-span-2"><dt>Title</dt><dd className="font-medium">{content.title}</dd></div>
                                    <div className="sm:col-span-2"><dt>Justification</dt><dd className="whitespace-pre-wrap">{content.justification}</dd></div>
                                    <div><dt>Priority</dt><dd>{requestPriorityLabel(content.priority ?? "MEDIUM")}</dd></div>
                                    <div><dt>Department</dt><dd>{user.department?.name ?? "Not assigned"}</dd></div>
                                    {visible.map((field) => <div key={field.key}><dt>{field.label.en}</dt><dd>{typeof content.fields?.[field.key] === "boolean" ? content.fields[field.key] ? "Yes" : "No" : field.constraints?.options?.find((option) => option.value === content.fields?.[field.key])?.label.en ?? String(content.fields?.[field.key] ?? "—")}</dd></div>)}
                                </dl>
                                {!!content.lineItems?.length && <ul className="divide-y border-y">{content.lineItems.map((item, index) => <li key={index} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3"><span>{item.description}</span><span className="tabular-nums text-muted-foreground">{item.quantity} × {item.unitAmount}</span></li>)}</ul>}
                                {type?.monetary && <p className="font-medium tabular-nums">Total: {type.supportsLineItems ? sumAmounts((content.lineItems ?? []).map((item) => itemTotal(item.quantity, item.unitAmount))) : content.monetaryAmount} THB</p>}
                                <p className="rounded-lg bg-muted/60 p-4 text-sm leading-relaxed text-muted-foreground">Submission locks this revision. The server checks the active department, policy and eligible reviewers before assigning a request number.</p>
                            </div>}
                        </>}
                    </section>
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                            {step > 0 && <ActionButton type="button" variant="ghost" onClick={() => setStep((value) => value - 1)}><ChevronLeft aria-hidden="true" className="size-4" />Back</ActionButton>}
                            <div className="ml-auto flex flex-wrap justify-end gap-2">
                                <ActionButton type="button" disabled={!type} aria-describedby={!type ? "save-draft-hint" : undefined} onClick={() => void save()}>Save Draft</ActionButton>
                                <ActionButton ref={submitButton} type="submit" variant="primary" disabled={!type}>{busy ? "Saving…" : step === steps.length - 1 ? "Submit request" : "Next"}{step < steps.length - 1 && <ChevronRight aria-hidden="true" className="size-4" />}</ActionButton>
                            </div>
                        </div>
                        {!type && <p id="save-draft-hint" className="text-right text-sm text-muted-foreground">Select a request type to enable Save Draft.</p>}
                    </div>
                </ManagedForm>
            </div>
        </div>
        {confirming && <dialog ref={dialog} aria-labelledby="confirm-title" onCancel={(event) =>
        {
            event.preventDefault();
            if (!busy) setConfirming(false);
        }} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md space-y-5 rounded-xl border bg-background p-6 text-foreground backdrop:bg-black/50"><h2 id="confirm-title" className="text-lg font-semibold">Submit this request?</h2><p className="text-sm">Submitted content becomes read-only. The server will validate routing and assign the official number.</p><div className="flex justify-end gap-3"><Button type="button" disabled={busy} onClick={() => setConfirming(false)}>Keep editing</Button><Button type="button" disabled={busy} className="bg-primary px-4 py-2 text-primary-foreground" onClick={() => void save(true)}>{busy ? "Submitting…" : "Confirm submission"}</Button></div></dialog>}
    </div>;
}
