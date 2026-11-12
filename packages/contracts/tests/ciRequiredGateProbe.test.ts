import { expect, test } from "vitest";

test("intentionally fails to demonstrate required CI protection", () =>
{
    expect("required-check-failed").toBe("required-check-passed");
});
