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
  *"run jobs update "*) if [[ "$FAILURE" == cleanup-update && "$*" == *"attachments:cleanup"* ]]; then exit 1; fi ;;
  *"run services update "*) if [[ "$FAILURE" == deploy ]]; then exit 1; fi; echo approval-00001 ;;
  *"latestReadyRevisionName"*) echo approval-00001 ;;
  *"run revisions describe"*) echo "$PINNED_IMAGE" ;;
  *"json(status.url,metadata.annotations)"*) if [[ "$FAILURE" == describe ]]; then exit 1; fi; echo "$SERVICE_DESCRIPTION" ;;
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
        const result = spawnSync("bash", ["deploy/release.sh"], { encoding: "utf8", env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, REAL_NODE: process.execPath, CALL_LOG: log, PINNED_IMAGE: image, SERVICE_DESCRIPTION: JSON.stringify({ status: { url: "https://approval-abc.a.run.app" } }), FAILURE: failure, PROJECT_ID: "test-project", REGION: "asia-southeast3", REGISTRY: "releases", SERVICE_NAME: "approval", MIGRATE_JOB_NAME: "migrate", PUBLIC_ORIGIN: "https://approval-abc.a.run.app", IMAGE_TAG: "a".repeat(40), GITHUB_REF: "refs/heads/main", GITHUB_STEP_SUMMARY: join(directory, "summary"), ...overrides } });
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

test("Singapore cutover reuses Bangkok registry and rejects unrelated regions", () =>
{
    const result = release("", { REGION: "asia-southeast1", REGISTRY_REGION: "asia-southeast3" });
    assert.equal(result.status, 0, result.error);
    assert.match(result.calls, /--region=asia-southeast1/);
    assert.match(result.calls, /--image=asia-southeast3-docker.pkg.dev/);
    for (const override of [{ REGION: "us-central1" }, { REGISTRY_REGION: "us-central1" }])
    {
        const invalid = release("", override);
        assert.notEqual(invalid.status, 0);
        assert.equal(invalid.calls, "");
    }
});

test("reviewed deterministic origin accepts an exact service URL alias", () =>
{
    const origin = "https://approval-142175982679.asia-southeast1.run.app";
    const result = release("", {
        REGION: "asia-southeast1",
        REGISTRY_REGION: "asia-southeast3",
        PUBLIC_ORIGIN: origin,
        SERVICE_DESCRIPTION: JSON.stringify({
            status: { url: "https://approval-abc.a.run.app" },
            metadata: { annotations: { "run.googleapis.com/urls": JSON.stringify([origin, "https://approval-abc.a.run.app"]) } },
        }),
    });
    assert.equal(result.status, 0, result.error);
    assert.match(result.calls, /--region=asia-southeast1/);
    assert.match(result.calls, /--image=asia-southeast3-docker.pkg.dev/);
    assert.match(result.calls, /--to-revisions=approval-00001=100/);
    assert(result.calls.includes(`smoke --import tsx deploy/smoke.ts ${origin}`));
});

test("unverified origins and unreadable service metadata stop before mutations", () =>
{
    const origin = "https://approval-142175982679.asia-southeast1.run.app";
    for (const urls of [undefined, "[]", "{}", JSON.stringify(origin), "invalid", JSON.stringify([`${origin}.other.run.app`])])
    {
        const result = release("", {
            PUBLIC_ORIGIN: origin,
            SERVICE_DESCRIPTION: JSON.stringify({
                status: { url: "https://approval-abc.a.run.app" },
                metadata: { annotations: { "run.googleapis.com/urls": urls } },
            }),
        });
        assert.notEqual(result.status, 0);
        assert.doesNotMatch(result.calls, /run jobs|run services update|smoke/);
    }
    for (const failure of ["", "describe"])
    {
        const result = release(failure, { SERVICE_DESCRIPTION: "invalid" });
        assert.notEqual(result.status, 0);
        assert.doesNotMatch(result.calls, /run jobs|run services update|smoke/);
    }
});

test("cloud run release wires GCS attachment storage env vars safely without breaking defaults", () =>
{
    const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
    assert.match(workflow, /GCS_PROJECT_ID:/);
    assert.match(workflow, /GCS_BUCKET_NAME:/);

    const defaulted = release();
    assert.equal(defaulted.status, 0, defaulted.error);
    assert.match(
        defaulted.calls,
        /--update-env-vars=ATTACHMENT_STORAGE_DRIVER=gcs,GCS_PROJECT_ID=test-project,GCS_BUCKET_NAME=approval-system-attachments/,
    );

    const configured = release("", {
        GCS_PROJECT_ID: "cpe334-514311",
        GCS_BUCKET_NAME: "approval-system-attachments",
    });
    assert.equal(configured.status, 0, configured.error);
    assert.match(
        configured.calls,
        /--update-env-vars=ATTACHMENT_STORAGE_DRIVER=gcs,GCS_PROJECT_ID=cpe334-514311,GCS_BUCKET_NAME=approval-system-attachments/,
    );

    const invalidBucket = release("", { GCS_BUCKET_NAME: "INVALID_BUCKET!" });
    assert.notEqual(invalidBucket.status, 0);
    assert.equal(invalidBucket.calls, "");

    assert.match(workflow, /CLEANUP_JOB_NAME:/);
    const withCleanupJob = release("", {
        CLEANUP_JOB_NAME: "approval-attachments-cleanup",
        GCS_PROJECT_ID: "cpe334-514311",
        GCS_BUCKET_NAME: "approval-system-attachments",
    });
    assert.equal(withCleanupJob.status, 0, withCleanupJob.error);
    assert.match(
        withCleanupJob.calls,
        /run jobs update approval-attachments-cleanup --image=.*@sha256:[b]{64} --command=npm --args=run,attachments:cleanup --update-env-vars=ATTACHMENT_STORAGE_DRIVER=gcs,GCS_PROJECT_ID=cpe334-514311,GCS_BUCKET_NAME=approval-system-attachments --tasks=1 --parallelism=1 --max-retries=1/,
    );
    assert(
        withCleanupJob.calls.indexOf("update-traffic") < withCleanupJob.calls.indexOf("approval-attachments-cleanup"),
        "cleanup job synchronization must happen after application smoke and traffic switch",
    );

    const cleanupFailure = release("cleanup-update", {
        CLEANUP_JOB_NAME: "approval-attachments-cleanup",
    });
    assert.notEqual(cleanupFailure.status, 0);

    const invalidCleanupJob = release("", { CLEANUP_JOB_NAME: "INVALID_JOB!" });
    assert.notEqual(invalidCleanupJob.status, 0);
    assert.equal(invalidCleanupJob.calls, "");
});
