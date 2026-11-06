import { Navigate, useNavigate, useSearchParams } from "react-router";
import { LoginForm } from "~/modules/auth/LoginForm";
import { useSession } from "~/modules/auth/sessionContext";

export function meta()
{
    return [{ title: "Sign in · Workflow and Approval System" }];
}

function safeReturnPath(value: string | null): string
{
    return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export default function LoginRoute()
{
    const { status, signIn, logoutWarning, retryPending, retrySignOut } = useSession();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const from = safeReturnPath(searchParams.get("from"));

    if (status === "authenticated") return <Navigate to={from} replace />;

    return (
        <main className="flex min-h-screen items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-6">
                <div className="space-y-1 text-center">
                    <h1 className="text-xl font-semibold">Sign in</h1>
                    <p className="text-sm text-muted-foreground">Use your work email and password.</p>
                </div>
                {logoutWarning && <div role="alert">Signed out on this device. Server sign-out could not be confirmed. <button type="button" disabled={retryPending} onClick={() => void retrySignOut()}>Retry sign out</button></div>}
                <LoginForm
                    onSubmit={async (credentials) =>
                    {
                        await signIn(credentials);
                        navigate(from, { replace: true });
                    }}
                />
            </div>
        </main>
    );
}
