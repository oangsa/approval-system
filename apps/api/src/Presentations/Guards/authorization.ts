import type { UserRole } from "@workflow/contracts";
import type { IActor } from "../../Domains/Identity/Identity";
import { AuthorizationPolicy } from "../../Domains/Identity/AuthorizationPolicy";
import { IdentityError } from "../../Domains/Identity/IdentityError";
import { HttpError } from "../errors";

const policy = new AuthorizationPolicy();
export function requireAnyRole(roles: readonly UserRole[], allowed: readonly UserRole[]): void
{
    if (!policy.HasAnyRole(roles, allowed)) throw new IdentityError("FORBIDDEN");
}
export function canReadPrivate(actorId: string, ownerId: string, roles: readonly UserRole[], assigned = false): boolean
{
    return policy.IsOwner(actorId, ownerId) || policy.IsEligibleReviewer(actorId, ownerId, assigned, roles);
}
export function requirePrivateAccess(actor: Pick<IActor, "account" | "roles">, ownerId: string | undefined, assigned: boolean): void
{
    if (!ownerId || !canReadPrivate(actor.account.id, ownerId, actor.roles, assigned)) throw new HttpError("NOT_FOUND");
}
