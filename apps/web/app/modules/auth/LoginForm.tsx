import { useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { loginRequestSchema } from "@workflow/contracts";
import { ZodError } from "zod";
import { isApiFailure } from "~/api/errors";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";

export interface ILoginFormProps
{
    onSubmit(credentials: { email: string; password: string }): Promise<void>;
}

type ErrorKind = "credentials" | "rate-limited" | "network" | "validation";
type FieldErrors = Partial<Record<"email" | "password", string>>;
const errorMessages: Record<ErrorKind, string> = {
    credentials: "Email or password is incorrect.",
    "rate-limited": "Too many attempts. Please wait before trying again.",
    network: "We could not reach the server. Check your connection and try again.",
    validation: "Enter a valid email address and password.",
};
function classify(error: unknown): ErrorKind
{
    if (error instanceof ZodError) return "validation";
    if (isApiFailure(error))
    {
        if (error.status === 401) return "credentials";
        if (error.status === 429) return "rate-limited";
        if (error.status === 422 || error.status === 400) return "validation";
    }
    return "network";
}
export function LoginForm({ onSubmit }: ILoginFormProps)
{
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [revealed, setRevealed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<ErrorKind | null>(null);
    const [fields, setFields] = useState<FieldErrors>({});
    const emailRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);

    async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void>
    {
        event.preventDefault();
        if (busy) return;
        setError(null);
        const result = loginRequestSchema.safeParse({ email, password });
        if (!result.success)
        {
            const next: FieldErrors = {};
            for (const issue of result.error.issues)
            {
                if (issue.path[0] === "email") next.email = "Enter a valid email address.";
                if (issue.path[0] === "password") next.password = "Enter a password.";
            }
            setFields(next);
            (next.email ? emailRef : passwordRef).current?.focus();
            return;
        }
        setFields({});
        setBusy(true);
        try
        {
            await onSubmit(result.data);
        }
        catch (cause)
        {
            setError(classify(cause));
        }
        finally
        {
            setBusy(false);
        }
    }
    return (
        <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-4">
            <div className="space-y-1.5">
                <label htmlFor="login-email" className="text-sm font-medium">Email</label>
                <Input ref={emailRef} id="login-email" name="email" type="email" autoComplete="email" required value={email}
                    onChange={(event) =>
                    {
                        setEmail(event.target.value);
                        setFields((old) => ({ ...old, email: undefined }));
                    }}
                    aria-invalid={Boolean(fields.email) || undefined} aria-describedby={fields.email ? "login-email-error" : undefined} />
                {fields.email && <p id="login-email-error" className="text-sm text-destructive">{fields.email}</p>}
            </div>
            <div className="space-y-1.5">
                <label htmlFor="login-password" className="text-sm font-medium">Password</label>
                <div className="relative">
                    <Input ref={passwordRef} id="login-password" name="password" type={revealed ? "text" : "password"} autoComplete="current-password" required value={password}
                        onChange={(event) =>
                        {
                            setPassword(event.target.value);
                            setFields((old) => ({ ...old, password: undefined }));
                        }}
                        aria-invalid={Boolean(fields.password) || undefined} aria-describedby={fields.password ? "login-password-error" : undefined} className="pr-10" />
                    <Button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:bg-secondary" aria-label={revealed ? "Hide password" : "Show password"} aria-pressed={revealed} onClick={() => setRevealed((value) => !value)}>
                        {revealed ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
                    </Button>
                </div>
                {fields.password && <p id="login-password-error" className="text-sm text-destructive">{fields.password}</p>}
            </div>
            {error && <p id="login-error" role="alert" className={cn("text-sm", error === "network" ? "text-muted-foreground" : "text-destructive")}>{errorMessages[error]}</p>}
            <Button type="submit" disabled={busy} aria-busy={busy} className="flex w-full items-center justify-center gap-2 bg-primary px-4 py-2 text-primary-foreground hover:opacity-90">
                {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}{busy ? "Signing in…" : "Sign in"}
            </Button>
        </form>
    );
}
