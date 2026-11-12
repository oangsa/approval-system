import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "~/components/ui/button";

interface ICollectionDialogProps
{
    title: string;
    description: string;
    children: ReactNode;
    onClose(): void;
}

export function CollectionDialog({ title, description, children, onClose }: ICollectionDialogProps)
{
    const ref = useRef<HTMLDialogElement>(null);
    const id = useId();
    useEffect(() =>
    {
        const previous = document.activeElement;
        const dialog = ref.current;
        dialog?.showModal();
        return () =>
        {
            dialog?.close();
            if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
        };
    }, []);
    function trapTab(event: KeyboardEvent<HTMLDialogElement>)
    {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]"));
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first)
        {
            event.preventDefault();
            last?.focus();
        }
        else if (!event.shiftKey && document.activeElement === last)
        {
            event.preventDefault();
            first?.focus();
        }
    }
    return <dialog ref={ref} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
        onKeyDown={trapTab}
        onCancel={(event) =>
        {
            event.preventDefault();
            onClose();
        }} onClick={(event) =>
        {
            if (event.target === event.currentTarget) onClose();
        }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto overscroll-contain rounded-xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-foreground/40 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
        <div className="flex items-start justify-between gap-4 border-b p-5 sm:px-6">
            <div><h2 id={`${id}-title`} className="text-lg font-semibold">{title}</h2><p id={`${id}-description`} className="mt-1 text-sm text-muted-foreground">{description}</p></div>
            <Button type="button" onClick={onClose} aria-label="Close filters" className="rounded-md p-2 hover:bg-secondary"><X aria-hidden="true" className="size-4" /></Button>
        </div>
        {children}
    </dialog>;
}
