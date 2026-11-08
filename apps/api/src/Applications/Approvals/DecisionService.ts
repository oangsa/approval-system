import { createHash } from "node:crypto";
import type { DecisionRequest, TimelineQuery } from "@workflow/contracts";
import type { IActor } from "../../Domains/Identity/Identity";
import type { IDecisionUnitOfWork } from "../../Domains/Approvals/DecisionPorts";
import { decideTransition } from "../../Domains/Approvals/DecisionRules";
export class DecisionService
{
    constructor(private readonly unit: IDecisionUnitOfWork)
{}
    public Decide(actor: IActor, taskId: string, body: DecisionRequest, key: string)
    {
        return this.unit.Run(async (repository) =>
        {
            actor = await repository.CurrentActor(actor);
            const scope = `POST /api/v1/approval-tasks/${taskId}/decisions`;
            const hash = createHash("sha256").update(JSON.stringify([body.decision, body.reason ?? null, body.expectedVersion])).digest("hex");
            const replay = await repository.Replay(actor.account.id, scope, key, hash);
            if (replay) return replay;
            const state = await repository.Lock(actor, taskId);
            const transition = decideTransition(state, taskId, body);
            const result = await repository.Save(actor.account.id, taskId, body, state, transition);
            await repository.Complete(actor.account.id, scope, key, hash, result);
            return result;
        });
    }
    public Timeline(actor: IActor, requestId: string, query: TimelineQuery)
    {
        return this.unit.Run(async (repository) => repository.Timeline(await repository.CurrentActor(actor), requestId, query));
    }
}
