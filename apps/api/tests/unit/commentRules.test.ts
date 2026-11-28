import { describe, expect, it } from "vitest";
import { MAX_COMMENT_BODY_LENGTH } from "@workflow/contracts";
import { NormalizeCommentBody } from "../../src/Domains/Requests/CommentRules";
import { RequestError } from "../../src/Domains/Requests/RequestRules";

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

    // Note: CMT-UT-02 (CommentService.AddComment with stub unit of work) is implemented in Packet P4
    // alongside CommentService.
});
