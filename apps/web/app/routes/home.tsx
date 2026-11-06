import { Link } from "react-router";

export function meta()
{
    return [{ title: "Workflow and Approval System" }];
}

export default function Home()
{
    return (
        <main className="mx-auto max-w-xl space-y-3 p-8">
            <h1 className="text-2xl font-semibold">Workflow and Approval System</h1>
            <p className="text-muted-foreground">Project foundation is ready.</p>
            <Link to="/auth/login" className="inline-block text-sm font-medium underline underline-offset-4">Sign in</Link>
        </main>
    );
}
