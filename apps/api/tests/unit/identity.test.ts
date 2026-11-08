import { expect, test } from "vitest";
import { AuthorizationPolicy } from "../../src/Domains/Identity/AuthorizationPolicy";
import { isCurrentIdentity, isCurrentRefresh, type IActor, type IRefreshHistory } from "../../src/Domains/Identity/Identity";
test("current roles compose and ownership and eligibility default deny", () =>
{
    const policy = new AuthorizationPolicy();
    expect(policy.HasAnyRole(["REQUESTER", "REVIEWER"], ["REVIEWER"])).toBe(true);
    expect(policy.HasAnyRole(["ADMINISTRATOR"], [])).toBe(false);
    expect(policy.IsOwner("a", "a")).toBe(true);
    expect(policy.IsOwner("a", "b")).toBe(false);
    expect(policy.IsEligibleReviewer("a", "a", true, ["REVIEWER"])).toBe(false);
    expect(policy.IsEligibleReviewer("a", "b", true, ["REVIEWER"])).toBe(true);
    expect(policy.IsEligibleReviewer("a", "b", false, ["REVIEWER"])).toBe(false);
    expect(policy.IsEligibleReviewer("a", "b", true, [])).toBe(false);
    expect(policy.IsEligibleReviewer("a", "b", true, ["ADMINISTRATOR"])).toBe(false);
});
test("identity and refresh require active, matching, unrevoked and unexpired state", () =>
{
    const now = new Date("2026-01-01T00:00:00Z"); const expiry = new Date(now.getTime() + 1000);
    const actor: IActor = { account: { id: "a", email: "a", displayName: "a", passwordHash: "x", isActive: true, authVersion: 1, createdAt: now, updatedAt: now }, family: { id: "f", userId: "a", authVersion: 1, createdAt: now, expiresAt: expiry, revokedAt: null }, roles: [], department: null };
    const token: IRefreshHistory = { id: "t", familyId: "f", tokenHash: "x", createdAt: now, expiresAt: expiry, consumedAt: null };
    expect(isCurrentIdentity(actor, 1, now)).toBe(true);
    expect(isCurrentIdentity(actor, 2, now)).toBe(false);
    expect(isCurrentIdentity({ ...actor, account: { ...actor.account, isActive: false } }, 1, now)).toBe(false);
    expect(isCurrentIdentity({ ...actor, family: { ...actor.family, userId: "other" } }, 1, now)).toBe(false);
    expect(isCurrentIdentity({ ...actor, family: { ...actor.family, revokedAt: now } }, 1, now)).toBe(false);
    expect(isCurrentIdentity({ ...actor, family: { ...actor.family, authVersion: 2 } }, 1, now)).toBe(false);
    expect(isCurrentIdentity(actor, 1, expiry)).toBe(false);
    expect(isCurrentRefresh(token, actor.family, now)).toBe(true);
    expect(isCurrentRefresh({ ...token, familyId: "other" }, actor.family, now)).toBe(false);
    expect(isCurrentRefresh({ ...token, consumedAt: now }, actor.family, now)).toBe(false);
    expect(isCurrentRefresh(token, { ...actor.family, revokedAt: now }, now)).toBe(false);
    expect(isCurrentRefresh(token, actor.family, expiry)).toBe(false);
    expect(isCurrentRefresh({ ...token, expiresAt: new Date(expiry.getTime() + 1) }, actor.family, now)).toBe(false);
    expect(isCurrentRefresh(token, { ...actor.family, expiresAt: now }, now)).toBe(false);
});
