# BUG-B02 original Next regression evidence

On 2026-11-20 (ICT), the original Next regression was replayed on
`340fe8efd0072ecd64826cae634e0f11d3ce4efb`, the parent of original fix commit
`a975187ebbdd04577dbed43806c76a97a67c1864`. The detached checkout root was
`/tmp/bug-b02-original-red`. Runtime: Node v24.18.1, npm 11.16.0,
Vitest 4.1.10, jsdom.

The current `apps/web/tests/components/requestTypes.test.tsx` was copied unchanged
into that checkout. Only this test file differed from the historical commit.
Its SHA-256 in both checkouts was
`7464e3a2003416c45952be3a3bb21828e5c3b572c902060c3e18a74c6999b4af`.
The 201 / 200 character-counter assertion now follows the Next click and both
specific-message assertions, so missing counter markup cannot mask the original
validation-message failure.

Commands run from the historical checkout root:

```sh
npm ci
npm run test:web -- -t 'BUG-B02 title limit feedback'
```

`npm ci` completed successfully. The first sandboxed installation was interrupted
while waiting; the successful installation ran with network access. No product
code, dependency versions, or lockfile was changed for the replay.

[RED output](evidence/bug-b02/red-next.txt): exit 1, one selected test failed.
After pressing Next, focus, retained title value, and `aria-invalid` assertions
passed. The first specific-message assertion failed at line 67:

- Expected: `Title must be 200 characters or fewer.`
- Received: `Too big: expected string to have <=200 characters`

This clean-checkout replay does **not** reproduce the deployed build's literal
`Invalid input` wording. It reproduces the missing explicit Title-specific
message on the requested historical source and lockfile. The alert and counter
assertions follow the failure and were not reached during RED. No error wording
was forced or mocked to match the production report.

[GREEN output](evidence/bug-b02/green-next.txt): the same test file and command
passed on the fixed branch based on `bca05aa`, with only the assertion reorder
applied to source/tests. Exit 0, one selected test passed. The command filters out
other tests; skipped tests are not claimed as verified by these captures.

Captured test output is retained with trailing blank lines removed.
