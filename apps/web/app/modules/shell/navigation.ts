import type { UserRole } from "@workflow/contracts";

export interface INavigationItem
{
    to: string;
    label: string;
    /** Roles allowed to see this link; empty means every authenticated role. */
    roles: readonly UserRole[];
}

/** Only links to routes that actually ship in this feature are declared here. */
export const navigationItems: readonly INavigationItem[] = [
    { to: "/dashboard", label: "Dashboard", roles: [] },
    { to: "/requests/new", label: "New request", roles: ["REQUESTER"] },
    { to: "/settings", label: "Settings", roles: [] },
];

/** Role-aware filtering: an item is visible only when its role grant matches the current union. */
export function visibleNavigation(items: readonly INavigationItem[], roles: readonly UserRole[]): INavigationItem[]
{
    return items.filter((item) => item.roles.length === 0 || item.roles.some((role) => roles.includes(role)));
}