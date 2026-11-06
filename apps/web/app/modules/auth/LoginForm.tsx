import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { isApiFailure } from "~/api/errors";
import { cn } from "~/lib/utils";

export interface ILoginFormProps
{
    onSubmit(credentials: { email: string; password: string }): Promise<void>;
}

type ErrorKind = "credentials" | "rate-limited" | "network" | "validation";

const errorMessages: Record<ErrorKind, string> = {
    credentials: "Email or password is incorrect.",
    "rate-limited": "Too many attempts. Please wait before trying again.",
    network: "We could not reach the server. Check your connection and try again.",
    validation: "Enter a valid email address and password.",
};

function classify(error: unknown): ErrorKind
{
    if (isApiFailure(error))
    {
        if (error.status === 401) return "credentials";
        if (error.status === 429) return "rate-limited";
        if (error.status === 422 || error.status === 400) return "validation";
        return "network";
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

    async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void>
    {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        try
        {
            await onSubmit({ email, password });
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
                <input
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    aria-invalid={error === "validation" || undefined}
                    aria-describedby={error === "validation" ? "login-error" : undefined}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2"
                />
            </div>

            <div className="space-y-1.5">
                <label htmlFor="login-password" className="text-sm font-medium">Password</label>
                <div className="relative">
                    <input
                        id="login-password"
                        name="password"
                        type={revealed ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        aria-invalid={error === "validation" || undefined}
                        aria-describedby={error === "validation" ? "login-error" : undefined}
                        className="w-full rounded-md border bg-background px-3 py-2 pr-10 text-sm outline-none focus-visible:ring-2"
                    />
                    <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-secondary"
                        aria-label={revealed ? "Hide password" : "Show password"}
                        aria-pressed={revealed}
                        onClick={() => setRevealed((value) => !value)}
                    >
                        {revealed ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            {error && (
                <p id="login-error" role="alert" className={cn("text-sm", error === "network" ? "text-muted-foreground" : "text-destructive")}>
                    {errorMessages[error]}
                </p>
            )}

            <button
                type="submit"
                disabled={busy}
                            aria-busy={busy}
                            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                        >
                {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
                {busy ? "Signing in…" : "Sign in"}
            </button>
        </form>
    );
}