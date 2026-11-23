# Accepted baseline Cloud Run evidence

Evidence supplied by Suthang in this chat on **23 November 2026 (ICT,
Asia/Bangkok, UTC+07:00)**. This is the receipt date; the screenshots do not
establish an exact capture timestamp. These records describe the accepted
baseline deployment, not a Lab 7 deployment or release authorization.

| Field | User-supplied evidence |
| --- | --- |
| Project | `cpe334-514311` |
| Service | `approval-system` |
| Cloud Run region | `asia-southeast1` |
| Selected ready revision | `approval-system-00017-cib` |
| Traffic allocation | Selected revision 100%; all ten other listed revisions 0% |
| Image repository location | `asia-southeast3` (separate from the service region) |
| Container image | `asia-southeast3-docker.pkg.dev/cpe334-514311/approval-releases/application@sha256:5319cb7c9f8777bd7981ce72948eb4877a2f41ecd3563dc30a6b8e055299f69f` |
| Accepted source | `39a32500e5d9a626055ab0a93da0aee906c85302` |

## Provenance and limits

- The Cloud Run Revision History screenshot shows the service, region, ready
  revision and 100% traffic allocation. The image field is truncated there.
- Suthang subsequently pasted the full container image reference above from
  the selected revision. The digest agrees with historical production release
  run `44749609137`, job `136336233709`. Artifact Registry also shows the
  accepted source tag for that image. This is supplied evidence, not an
  independent authenticated API query by Codex.
- The Monitoring screenshot shows the same project/service/region, but does
  not establish revision traffic allocation or the image digest.
- Codex's authorized read-only Console attempts failed at UI-runtime
  initialization. The later user-supplied screenshots/text supplement that
  failed attempt; they do not turn it into a successful independent query.
- Public read-only smoke on 22 November 2026, 23:52:31–23:52:47 ICT passed for
  the accepted source. It checks health/public SSR/login and release headers;
  it does not establish the changed Lab 7 workflow in production.

Original screenshots are retained privately in the course evidence package
under `cloud-run/`: `artifact-registry.png`, `monitoring.png`, and
`revision-history.png`, with original file hashes in
`cloud-run/observations.json`. Do not publish those account-console screenshots
to GitHub. The report's B5 summary and this record use the same provenance.

Lab 7 remains integrated into dev, with further reviewed promotions and explicit
production release authorization required. No deployment, traffic, IAM,
database or service configuration change was performed for this evidence check.
