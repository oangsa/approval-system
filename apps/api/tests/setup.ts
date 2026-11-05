import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() =>
{
    // Ordinary unit/HTTP tests must not inherit a developer's database targets.
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("TEST_DATABASE_URL", undefined);
});
afterEach(() => vi.useRealTimers());
