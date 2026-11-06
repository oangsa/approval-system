import { Link } from "react-router";

export function meta()
{
    return [{ title: "Not authorized · Workflow and Approval System" }];
}

export default function UnauthorizedRoute()
{
    return (
        <main className="mx-auto max-w-xl space-y-3 p-8">
            <h1 className="text-2xl font-semibold">You do not have access to this page</h1>
            <p className="text-muted-foreground">Your account is signed in, but its current roles do not allow this operation.</p>
            <Link to="/dashboard" className="text-sm font-medium underline underline-offset-4">Return to dashboard</Link>
        </main>
    );
}