import { LogOut } from "lucide-react";
import { ActionButton } from "~/components/actions/ActionButton";
import { useSession } from "~/modules/auth/sessionContext";

export function meta()
{
    return [{ title: "Settings · Workflow and Approval System" }];
}

export default function SettingsRoute()
{
    const { user, signOut } = useSession();
    if (!user) return null;
    return (
        <div className="max-w-lg space-y-6">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold">Account</h1>
                <p className="text-sm text-muted-foreground">Read-only summary of your current identity.</p>
            </div>
            <dl className="divide-y rounded-md border">
                <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                    <dt className="text-muted-foreground">Name</dt>
                    <dd className="font-medium">{user.displayName}</dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                    <dt className="text-muted-foreground">Email</dt>
                    <dd className="font-medium">{user.email}</dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                    <dt className="text-muted-foreground">Roles</dt>
                    <dd className="font-medium">{user.roles.join(", ")}</dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                    <dt className="text-muted-foreground">Department</dt>
                    <dd className="font-medium">{user.department ? user.department.name : "None"}</dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="font-medium">{user.isActive ? "Active" : "Disabled"}</dd>
                </div>
            </dl>
            <ActionButton variant="danger"
                type="button"
                onClick={() => void signOut()}
                className="border border-destructive/30"
            >
                <LogOut aria-hidden="true" className="size-4" />Sign out
            </ActionButton>
        </div>
    );
}