import type { FormEvent, ReactNode } from "react";

export interface IManagedFormProps
{
    children: ReactNode;
    onSubmit(event: FormEvent<HTMLFormElement>): void;
    busy: boolean;
}
export function ManagedForm({ children, onSubmit, busy }: IManagedFormProps)
{
    return <form noValidate onSubmit={onSubmit} aria-busy={busy} className="space-y-6"><fieldset disabled={busy} className="min-w-0 space-y-6">{children}</fieldset></form>;
}
