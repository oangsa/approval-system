import { describe, expect, it, vi } from "vitest";
import { MAX_COMMENT_BODY_LENGTH, type UserRole } from "@workflow/contracts";
import { CommentService } from "../../src/Applications/Requests/CommentService";
import type { IActor } from "../../src/Domains/Identity/Identity";
import type { ICommentRepository, ICommentUnitOfWork } from "../../src/Domains/Requests/CommentPorts";
import { NormalizeCommentBody } from "../../src/Domains/Requests/CommentRules";
import type { IRequestAccessContext } from "../../src/Domains/Requests/RequestAccessPolicy";
import { RequestError } from "../../src/Domains/Requests/RequestRules";

const NOW = new Date("2026-11-28T06:00:00.000Z");
const OWNER_ID = "10000000-0000-4000-8000-000000000001";
const REVIEWER_ID = "10000000-0000-4000-8000-000000000002";
const FOREIGN_ID = "10000000-0000-4000-8000-000000000003";
const REQUEST_ID = "20000000-0000-4000-8000-000000000001";

function makeActor(id: string, roles: readonly UserRole[], displayName: string): IActor
{
    return {
        account: {
            id,
            email: `${id}@example.test`,
            displayName,
            passwordHash: "hash",
            isActive: true,
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

describe("CommentRules", () =>
{
    it("CMT-UT-01 trims outer whitespace, preserves internal newlines, and enforces 1..4000 bounds", () =>
    {
        expect(NormalizeCommentBody("  Line 1\n\nLine 2\t  ")).toBe("Line 1\n\nLine 2");
        expect(NormalizeCommentBody("a")).toBe("a");

        const maxBody = "x".repeat(MAX_COMMENT_BODY_LENGTH);
        expect(NormalizeCommentBody(` \n ${maxBody} \t `)).toBe(maxBody);

        for (const invalid of ["", "   ", "\n\t  \r\n", "x".repeat(MAX_COMMENT_BODY_LENGTH + 1)])
        {
            expect(() => NormalizeCommentBody(invalid)).toThrowError(
                expect.objectContaining<Partial<RequestError>>({ code: "VALIDATION_ERROR" }),
            );
        }
    });

    it("CMT-UT-02 verifies CurrentActor, RequestAccessPolicy, and AddComment without mutating request or decision state", async () =>
    {
        const owner = makeActor(OWNER_ID, ["REQUESTER"], "Owner User");
        const reviewer = makeActor(REVIEWER_ID, ["REVIEWER"], "Reviewer User");
        const foreign = makeActor(FOREIGN_ID, ["REQUESTER", "ADMINISTRATOR"], "Foreign Admin");

        const context: IRequestAccessContext = {
            requestId: REQUEST_ID,
            requesterId: OWNER_ID,
            status: "PENDING",
            workingRevisionId: null,
            submittedRevisionId: "30000000-0000-4000-8000-000000000001",
            currentApprovers: [{ reviewerId: REVIEWER_ID, status: "ACTIONABLE" }],
        };

        const repository: ICommentRepository = {
            CurrentActor: vi.fn(async (actor) => actor),
            ReadRequestAccessContext: vi.fn(async () => context),
            ListByRequest: vi.fn(async () => ({
                items: [],
                pagination: { currentPage: 1, pageSize: 20, totalPages: 0, totalCount: 0, hasPrevious: false, hasNext: false },
            })),
            Create: vi.fn(async (input) => ({
                id: "50000000-0000-4000-8000-000000000001",
                requestId: input.requestId,
                author: {
                    id: input.authorId,
                    displayName: input.authorId === OWNER_ID ? "Owner User" : "Reviewer User",
                },
                body: input.body,
                createdAt: NOW.toISOString(),
            })),
        };

        const unit: ICommentUnitOfWork = {
            Run: (operation) => operation(repository),
        };

        const service = new CommentService(unit);

        const ownerResult = await service.AddComment(owner, REQUEST_ID, "  Clarification\nLine 2  ");
        expect(ownerResult).toMatchObject({
            requestId: REQUEST_ID,
            author: { id: OWNER_ID, displayName: "Owner User" },
            body: "Clarification\nLine 2",
        });

        const reviewerResult = await service.AddComment(reviewer, REQUEST_ID, "  Please attach invoice  ");
        expect(reviewerResult).toMatchObject({
            requestId: REQUEST_ID,
            author: { id: REVIEWER_ID, displayName: "Reviewer User" },
            body: "Please attach invoice",
        });

        await expect(service.AddComment(foreign, REQUEST_ID, "Unauthorized")).rejects.toMatchObject({
            code: "NOT_FOUND",
        });

        expect(repository.CurrentActor).toHaveBeenCalledTimes(3);
        expect(repository.ReadRequestAccessContext).toHaveBeenCalledTimes(3);
        expect(repository.Create).toHaveBeenCalledTimes(2);
    });
});
