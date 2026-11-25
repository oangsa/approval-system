import type { IActor } from "../Identity/Identity";

export interface IReportingScope { administrator: boolean; requester: boolean; reviewer: boolean; }
export function reportScope(actor: IActor): IReportingScope
{
    return { administrator: actor.roles.includes("ADMINISTRATOR"), requester: actor.roles.includes("REQUESTER"), reviewer: actor.roles.includes("REVIEWER") };
}
