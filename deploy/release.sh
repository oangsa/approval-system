#!/usr/bin/env bash
# Updates precreated resources only. Humans review this before any cloud use.
set -euo pipefail
: "${PROJECT_ID:?}" "${REGION:?}" "${REGISTRY:?}" "${SERVICE_NAME:?}" "${MIGRATE_JOB_NAME:?}" "${PUBLIC_ORIGIN:?}" "${IMAGE_TAG:?}"
[[ "${GITHUB_REF:-}" == refs/heads/main ]] || { echo 'Only main releases are allowed.' >&2; exit 1; }
[[ "$IMAGE_TAG" =~ ^[a-f0-9]{40}$ ]] || exit 1
[[ "$PROJECT_ID" =~ ^[a-z][a-z0-9-]+$ && ( "$REGION" == asia-southeast1 || "$REGION" == asia-southeast3 ) ]] || exit 1
for name in "$REGISTRY" "$SERVICE_NAME" "$MIGRATE_JOB_NAME"; do
  [[ "$name" =~ ^[a-z][a-z0-9-]{0,48}$ ]] || exit 1
done
[[ "$PUBLIC_ORIGIN" =~ ^https://[a-z0-9-]+\.([a-z0-9-]+\.)?run\.app$ ]] || exit 1
registryRegion="${REGISTRY_REGION:-$REGION}"
[[ "$registryRegion" == asia-southeast1 || "$registryRegion" == asia-southeast3 ]] || exit 1
if [[ "${1:-}" == validate ]]; then exit 0; fi

image="$registryRegion-docker.pkg.dev/$PROJECT_ID/$REGISTRY/application"
digest="$(gcloud artifacts docker images describe "$image:$IMAGE_TAG" --project="$PROJECT_ID" --format='value(image_summary.fully_qualified_digest)')"
[[ "$digest" == "$image@sha256:"* && "${digest#"$image@sha256:"}" =~ ^[a-f0-9]{64}$ ]] || { echo 'Invalid image digest.' >&2; exit 1; }
common=(--project="$PROJECT_ID" --region="$REGION" --quiet)
actualOrigin="$(gcloud run services describe "$SERVICE_NAME" --format='value(status.url)' "${common[@]}")"
[[ "$actualOrigin" == "$PUBLIC_ORIGIN" ]] || { echo 'Canonical origin differs from reviewed configuration.' >&2; exit 1; }

# The precreated job has its own migration DB identity/secret and reviewed sizing.
# Override its command explicitly; never depend on a service startup migration.
gcloud run jobs update "$MIGRATE_JOB_NAME" --image="$digest" --command=npm --args=run,db:migrate --tasks=1 --parallelism=1 --max-retries=0 "${common[@]}"
execution="$(gcloud run jobs execute "$MIGRATE_JOB_NAME" --wait --format='value(metadata.name)' "${common[@]}")"
[[ -n "$execution" ]] || exit 1

# Keep old traffic while startup and read-only smoke validate the new image.
revision="$(gcloud run services update "$SERVICE_NAME" --image="$digest" --no-traffic --tag=candidate --format='value(status.latestCreatedRevisionName)' "${common[@]}")"
[[ "$revision" == "$SERVICE_NAME-"* ]] || exit 1
ready="$(gcloud run services describe "$SERVICE_NAME" --format='value(status.latestReadyRevisionName)' "${common[@]}")"
[[ "$ready" == "$revision" ]] || exit 1
servingImage="$(gcloud run revisions describe "$revision" --format='value(spec.containers[0].image)' "${common[@]}")"
[[ "$servingImage" == "$digest" ]] || exit 1
export CANDIDATE_REVISION="$revision"
candidate="$(gcloud run services describe "$SERVICE_NAME" --format='json(status.traffic)' "${common[@]}" | node --input-type=module -e 'let input = ""; for await (const chunk of process.stdin) input += chunk; const routes = JSON.parse(input).status.traffic; const route = routes.find((entry) => entry.tag === "candidate"); if (!route?.url || route.revisionName !== process.env.CANDIDATE_REVISION) process.exit(1); console.log(route.url);')"
[[ "$candidate" =~ ^https://[a-z0-9-]+\.([a-z0-9-]+\.)?run\.app$ ]] || exit 1
node --import tsx deploy/smoke.ts "$candidate" "$IMAGE_TAG"
gcloud run services update-traffic "$SERVICE_NAME" --to-revisions="$revision=100" "${common[@]}"
node --import tsx deploy/smoke.ts "$PUBLIC_ORIGIN" "$IMAGE_TAG"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  printf 'Release SHA: `%s`\n\nImage: `%s`\n\nRevision: `%s`\n\nMigration execution: `%s`\n\nURL: %s\n\nRead-only smoke: passed\n' "$IMAGE_TAG" "$digest" "$revision" "$execution" "$PUBLIC_ORIGIN" >> "$GITHUB_STEP_SUMMARY"
fi
