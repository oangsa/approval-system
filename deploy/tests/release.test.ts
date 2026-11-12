import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

function release(failure = "", overrides: NodeJS.ProcessEnv = {})
{
    const directory = mkdtempSync(join(tmpdir(), "approval-release-"));
    const log = join(directory, "calls");
    const image = `asia-southeast3-docker.pkg.dev/test-project/releases/application@sha256:${"b".repeat(64)}`;
    writeFileSync(join(directory, "gcloud"), `#!/bin/bash
echo "$*" >> "$CALL_LOG"
case "$*" in
  *"artifacts docker images describe"*) echo "$PINNED_IMAGE" ;;
  *"run jobs execute"*) if [[ "$FAILURE" == migration ]]; then exit 1; fi; echo migrate-execution ;;
  *"run services update "*) if [[ "$FAILURE" == deploy ]]; then exit 1; fi; echo approval-00001 ;;
  *"latestReadyRevisionName"*) echo approval-00001 ;;
  *"run revisions describe"*) echo "$PINNED_IMAGE" ;;
  *"status.url"*) echo https://approval-abc.a.run.app ;;
  *"status.traffic"*) echo '{"status":{"traffic":[{"tag":"candidate","revisionName":"approval-00001","url":"https://candidate---approval-abc.a.run.app"}]}}' ;;
esac
`, { mode: 0o755 });
    writeFileSync(join(directory, "node"), `#!/bin/bash
if [[ "$1" == --input-type=module ]]; then exec "$REAL_NODE" "$@"; fi
echo "smoke $*" >> "$CALL_LOG"
[[ "$FAILURE" != smoke ]]
`, { mode: 0o755 });
    try
    {
        const result = spawnSync("bash", ["deploy/release.sh"], { encoding: "utf8", env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, REAL_NODE: process.execPath, CALL_LOG: log, PINNED_IMAGE: image, FAILURE: failure, PROJECT_ID: "test-project", REGION: "asia-southeast3", REGISTRY: "releases", SERVICE_NAME: "approval", MIGRATE_JOB_NAME: "migrate", PUBLIC_ORIGIN: "https://approval-abc.a.run.app", IMAGE_TAG: "a".repeat(40), GITHUB_REF: "refs/heads/main", GITHUB_STEP_SUMMARY: join(directory, "summary"), ...overrides } });
        let calls = "";
        try
        {
            calls = readFileSync(log, "utf8");
        }
        catch
        {
            // Invalid settings must fail before any external command.
        }
        return { status: result.status, calls, error: result.stderr };
    }
    finally
    {
        rmSync(directory, { recursive: true, force: true });
    }
}

test("migration failure leaves service and traffic untouched", () =>
{
    const result = release("migration");
    assert.notEqual(result.status, 0);
    assert.match(result.calls, /run jobs execute .*--wait/);
    assert.doesNotMatch(result.calls, /run services update/);
});
test("candidate startup or smoke failure never switches traffic", () =>
{
    for (const failure of ["deploy", "smoke"])
    {
        const result = release(failure);
        assert.notEqual(result.status, 0);
        assert.doesNotMatch(result.calls, /update-traffic/);
    }
});
test("success pins both migration and app to digest before explicit traffic switch", () =>
{
    const result = release();
    assert.equal(result.status, 0, result.error);
    assert.match(result.calls, /--command=npm --args=run,db:migrate/);
    assert.equal((result.calls.match(/--image=.*@sha256:[b]{64}/g) ?? []).length, 2);
    assert.match(result.calls, /--no-traffic --tag=candidate/);
    assert.match(result.calls, /--to-revisions=approval-00001=100/);
    assert(result.calls.indexOf("smoke") < result.calls.indexOf("update-traffic"));
});
test("non-main or malformed revision fails before cloud access", () =>
{
    for (const override of [{ GITHUB_REF: "refs/heads/dev" }, { IMAGE_TAG: "latest" }])
    {
        const result = release("", override);
        assert.notEqual(result.status, 0);
        assert.equal(result.calls, "");
    }
});
test("wrong digest or canonical origin stops before migration and service updates", () =>
{
    for (const override of [{ PINNED_IMAGE: "untrusted@sha256:bad" }, { PUBLIC_ORIGIN: "https://other-abc.a.run.app" }])
    {
        const result = release("", override);
        assert.notEqual(result.status, 0);
        assert.doesNotMatch(result.calls, /run jobs|run services update/);
    }
});
test("workflow requires same-source CI, protected environment, main and serialized releases", () =>
{
    const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
    assert.match(workflow, /branches: \[main\]/);
    assert.match(workflow, /uses: \.\/\.github\/workflows\/ci.yml/);
    assert.match(workflow, /needs: verification/);
    assert.match(workflow, /needs.verification.result == 'success'/);
    assert.match(workflow, /environment: production/);
    assert.match(workflow, /cancel-in-progress: false/);
    assert.doesNotMatch(workflow, /always\(\)|continue-on-error|workflow_dispatch|credentials_json/);
});
test("periodic database health checks use main, explicit opt-in and no cloud credentials", () =>
{
    const workflow = readFileSync(".github/workflows/availability.yml", "utf8");
    assert.match(workflow, /23 \*\/6 \* \* \*/);
    assert.match(workflow, /github.ref == 'refs\/heads\/main'/);
    assert.match(workflow, /AVAILABILITY_CHECK_ENABLED == 'true'/);
    assert.match(workflow, /permissions: \{\}/);
    assert.match(workflow, /--fail --max-time 30 "\$PUBLIC_ORIGIN\/health"/);
    assert.doesNotMatch(workflow, /secrets\.|id-token|gcloud|DATABASE_URL/);
});
