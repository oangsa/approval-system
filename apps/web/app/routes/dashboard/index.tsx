import { useSession } from "~/modules/auth/sessionContext";

export function meta()
{
    return [{ title: "Dashboard · Workflow and Approval System" }];
}

export default function DashboardRoute()
{
    const { user } = useSession();
    return (
        <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
                Welcome back{user ? `, ${user.displayName}` : ""}. Business metrics arrive with a later release.
            </p>
        </div>
    );
}