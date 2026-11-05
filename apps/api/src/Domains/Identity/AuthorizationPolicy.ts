import type { UserRole } from "@workflow/contracts";

export class AuthorizationPolicy
{
    public HasAnyRole(current: readonly UserRole[], allowed: readonly UserRole[]): boolean
    {
        return allowed.some((role) => current.includes(role));
    }
    public IsOwner(actorId: string, ownerId: string): boolean
    {
        return actorId === ownerId;
    }
    public IsEligibleReviewer(actorId: string, ownerId: string, assigned: boolean, roles: readonly UserRole[]): boolean
    {
        return actorId !== ownerId && assigned && roles.includes("REVIEWER");
    }
}
