import { describe, expect, it } from "vitest";
import type { RequestDetail, UserRole } from "@workflow/contracts";
import type { IActor } from "../../src/Domains/Identity/Identity";
import {
    RequestAccessPolicy,
    type IRequestAccessContext,
} from "../../src/Domains/Requests/RequestAccessPolicy";
import { RequestError } from "../../src/Domains/Requests/RequestRules";

const NOW = new Date("2026-11-28T06:00:00.000Z");
const OWNER_ID = "10000000-0000-4000-8000-000000000001";
const REVIEWER_ACTIONABLE_ID = "10000000-0000-4000-8000-000000000002";
const REVIEWER_WAITING_ID = "10000000-0000-4000-8000-000000000003";
const DELEGATE_ID = "10000000-0000-4000-8000-000000000004";
const HISTORIC_REVIEWER_ID = "10000000-0000-4000-8000-000000000005";
const FOREIGN_REQUESTER_ID = "10000000-0000-4000-8000-000000000006";
const ADMIN_ID = "10000000-0000-4000-8000-000000000007";
const REQUEST_ID = "20000000-0000-4000-8000-000000000001";
const WORKING_REVISION_ID = "30000000-0000-4000-8000-000000000001";
const SUBMITTED_REVISION_ID = "30000000-0000-4000-8000-000000000002";

function makeActor(id: string, roles: readonly UserRole[], isActive = true): IActor
{
    return {
        account: {
            id,
            email: `${id}@example.test`,
            displayName: `User ${id}`,
            passwordHash: "hash",
            isActive,
            authVersion: 1,
            createdAt: NOW,
            updatedAt: NOW,
        },
        family: {
            id: "40000000-0000-4000-8000-000000000001",
            userId: id,
            authVersion: 1,
            createdAt: NOW,
            expiresAt: new Date(NOW.getTime() + 3600_000),
            revokedAt: null,
        },
        roles,
        department: null,
    };
}

function makeRequestContext(overrides: Partial<IRequestAccessContext> = {}): IRequestAccessContext
{
    return {
        requestId: REQUEST_ID,
        requesterId: OWNER_ID,
        status: "PENDING",
        workingRevisionId: null,
        submittedRevisionId: SUBMITTED_REVISION_ID,
        now: NOW,
        currentApprovers: [
            { reviewerId: REVIEWER_ACTIONABLE_ID, status: "ACTIONABLE" },
            {
                reviewerId: REVIEWER_WAITING_ID,
                status: "WAITING",
                delegation: {
                    delegateId: DELEGATE_ID,
                    expiresAt: new Date(NOW.getTime() + 60_000),
                    revokedAt: null,
                },
            },
            { reviewerId: HISTORIC_REVIEWER_ID, status: "APPROVED" },
        ],
        ...overrides,
    };
}

describe("RequestAccessPolicy", () =>
{
    it("ACC-UT-01 allows owner in all statuses and current ACTIONABLE/WAITING/active-delegate reviewers only on PENDING", () =>
    {
        const owner = makeActor(OWNER_ID, ["REQUESTER"]);
        const actionableReviewer = makeActor(REVIEWER_ACTIONABLE_ID, ["REVIEWER"]);
        const waitingReviewer = makeActor(REVIEWER_WAITING_ID, ["REVIEWER"]);
        const activeDelegate = makeActor(DELEGATE_ID, ["REVIEWER"]);

        const allStatuses: RequestDetail["status"][] = ["DRAFT", "PENDING", "RETURNED", "APPROVED", "REJECTED", "WITHDRAWN"];
        for (const status of allStatuses)
        {
            const context = makeRequestContext({
                status,
                workingRevisionId: status === "DRAFT" || status === "RETURNED" ? WORKING_REVISION_ID : null,
            });
            expect(RequestAccessPolicy.CanReadCurrentRequest(owner, context)).toBe(true);
            expect(RequestAccessPolicy.CanPostComment(owner, context)).toBe(true);
            expect(
                RequestAccessPolicy.CanDownloadAttachment(owner, context, {
                    revisionId: WORKING_REVISION_ID,
                    submittedAt: null,
                }),
            ).toBe(true);
            expect(
                RequestAccessPolicy.CanDownloadAttachment(owner, context, {
                    revisionId: SUBMITTED_REVISION_ID,
                    submittedAt: NOW,
                }),
            ).toBe(true);

            const expectedReviewerAllowed = status === "PENDING";
            expect(RequestAccessPolicy.CanReadCurrentRequest(actionableReviewer, context)).toBe(expectedReviewerAllowed);
            expect(RequestAccessPolicy.CanPostComment(actionableReviewer, context)).toBe(expectedReviewerAllowed);
            expect(RequestAccessPolicy.CanReadCurrentRequest(waitingReviewer, context)).toBe(expectedReviewerAllowed);
            expect(RequestAccessPolicy.CanPostComment(waitingReviewer, context)).toBe(expectedReviewerAllowed);
            expect(RequestAccessPolicy.CanReadCurrentRequest(activeDelegate, context)).toBe(expectedReviewerAllowed);
            expect(RequestAccessPolicy.CanPostComment(activeDelegate, context)).toBe(expectedReviewerAllowed);
        }

        const pendingContext = makeRequestContext({ status: "PENDING" });
        expect(
            RequestAccessPolicy.CanDownloadAttachment(actionableReviewer, pendingContext, {
                revisionId: SUBMITTED_REVISION_ID,
                submittedAt: NOW,
            }),
        ).toBe(true);
        expect(
            RequestAccessPolicy.CanDownloadAttachment(actionableReviewer, pendingContext, {
                revisionId: WORKING_REVISION_ID,
                submittedAt: null,
            }),
        ).toBe(false);

        const expiredDelegateContext = makeRequestContext({
            status: "PENDING",
            currentApprovers: [
                {
                    reviewerId: REVIEWER_WAITING_ID,
                    status: "ACTIONABLE",
                    delegation: {
                        delegateId: DELEGATE_ID,
                        expiresAt: NOW,
                        revokedAt: null,
                    },
                },
            ],
        });
        expect(RequestAccessPolicy.CanReadCurrentRequest(activeDelegate, expiredDelegateContext)).toBe(false);
        expect(RequestAccessPolicy.CanPostComment(activeDelegate, expiredDelegateContext)).toBe(false);

        const revokedDelegateContext = makeRequestContext({
            status: "PENDING",
            currentApprovers: [
                {
                    reviewerId: REVIEWER_WAITING_ID,
                    status: "ACTIONABLE",
                    delegation: {
                        delegateId: DELEGATE_ID,
                        expiresAt: new Date(NOW.getTime() + 60_000),
                        revokedAt: NOW,
                    },
                },
            ],
        });
        expect(RequestAccessPolicy.CanReadCurrentRequest(activeDelegate, revokedDelegateContext)).toBe(false);
    });

    it("ACC-UT-02 denies historic-only reviewers, foreign requesters, unrelated admins, and owners without REQUESTER role", () =>
    {
        const context = makeRequestContext({ status: "PENDING" });
        const draftContext = makeRequestContext({
            status: "DRAFT",
            workingRevisionId: WORKING_REVISION_ID,
            submittedRevisionId: null,
            currentApprovers: [],
        });
        const returnedContext = makeRequestContext({
            status: "RETURNED",
            workingRevisionId: WORKING_REVISION_ID,
            currentApprovers: [{ reviewerId: HISTORIC_REVIEWER_ID, status: "RETURNED" }],
        });

        const historicReviewer = makeActor(HISTORIC_REVIEWER_ID, ["REVIEWER"]);
        const foreignRequester = makeActor(FOREIGN_REQUESTER_ID, ["REQUESTER"]);
        const unrelatedReviewer = makeActor("10000000-0000-4000-8000-000000000099", ["REVIEWER"]);
        const unrelatedAdmin = makeActor(ADMIN_ID, ["ADMINISTRATOR"]);
        const currentReviewer = makeActor(REVIEWER_ACTIONABLE_ID, ["REVIEWER"]);
        const ownerWithoutRequester = makeActor(OWNER_ID, ["REVIEWER"]);
        const disabledOwner = makeActor(OWNER_ID, ["REQUESTER"], false);
        const activeOwner = makeActor(OWNER_ID, ["REQUESTER"]);

        for (const deniedActor of [
            historicReviewer,
            foreignRequester,
            unrelatedReviewer,
            unrelatedAdmin,
            ownerWithoutRequester,
            disabledOwner,
        ])
        {
            expect(RequestAccessPolicy.CanReadCurrentRequest(deniedActor, context)).toBe(false);
            expect(RequestAccessPolicy.CanPostComment(deniedActor, context)).toBe(false);
            expect(RequestAccessPolicy.CanMutateWorkingAttachment(deniedActor, draftContext)).toBe(false);
            expect(
                RequestAccessPolicy.CanDownloadAttachment(deniedActor, context, {
                    revisionId: SUBMITTED_REVISION_ID,
                    submittedAt: NOW,
                }),
            ).toBe(false);
        }

        expect(RequestAccessPolicy.CanReadCurrentRequest(historicReviewer, returnedContext)).toBe(false);
        expect(RequestAccessPolicy.CanMutateWorkingAttachment(currentReviewer, draftContext)).toBe(false);
        expect(() => RequestAccessPolicy.AssertCanMutateWorkingAttachment(currentReviewer, draftContext)).toThrowError(
            expect.objectContaining<Partial<RequestError>>({ code: "NOT_FOUND" }),
        );
        expect(() => RequestAccessPolicy.AssertCanMutateWorkingAttachment(foreignRequester, draftContext)).toThrowError(
            expect.objectContaining<Partial<RequestError>>({ code: "NOT_FOUND" }),
        );
        expect(() => RequestAccessPolicy.AssertCanMutateWorkingAttachment(unrelatedAdmin, draftContext)).toThrowError(
            expect.objectContaining<Partial<RequestError>>({ code: "NOT_FOUND" }),
        );
        expect(() => RequestAccessPolicy.AssertCanMutateWorkingAttachment(ownerWithoutRequester, draftContext)).toThrowError(
            expect.objectContaining<Partial<RequestError>>({ code: "FORBIDDEN" }),
        );
        expect(() => RequestAccessPolicy.AssertCanMutateWorkingAttachment(disabledOwner, draftContext)).toThrowError(
            expect.objectContaining<Partial<RequestError>>({ code: "FORBIDDEN" }),
        );

        expect(RequestAccessPolicy.CanMutateWorkingAttachment(activeOwner, draftContext)).toBe(true);
        expect(RequestAccessPolicy.CanMutateWorkingAttachment(activeOwner, returnedContext)).toBe(true);
        expect(RequestAccessPolicy.CanMutateWorkingAttachment(activeOwner, context)).toBe(false);
        expect(() => RequestAccessPolicy.AssertCanMutateWorkingAttachment(activeOwner, context)).toThrowError(
            expect.objectContaining<Partial<RequestError>>({ code: "INVALID_REQUEST_TRANSITION" }),
        );
        expect(() =>
            RequestAccessPolicy.AssertCanMutateWorkingAttachment(
                activeOwner,
                makeRequestContext({ status: "DRAFT", workingRevisionId: null }),
            ),
        ).toThrowError(expect.objectContaining<Partial<RequestError>>({ code: "INVALID_REQUEST_TRANSITION" }));
    });
});
