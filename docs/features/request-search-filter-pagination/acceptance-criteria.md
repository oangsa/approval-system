# Numbered acceptance criteria

1. AC-037 / R12: number/title literal case-insensitive OR search combined with AND filters returns only authorized rows/counts.
2. AC-038 / R13: compatible exact/range/null operators and UTC boundaries work without precision loss; Bangkok controls map once.
3. AC-039 / R14: bounded 1-based pages, stable UUID tie, truthful direct-array/header/CORS transport, zero/final pages.
4. Invalid fields/operators/dates/pages/sort/hidden paths return safe 422; identity/department spoof cannot widen results.
5. Both collections restore URL query state; debounce/reset/chips/page-size/sort operate on server pages; malformed URL cannot silently broaden query.
6. Same mobile/desktop data and actions, no overflow; loading/error/retry/empty/no-match, abort and account isolation.
7. Appropriate contract/unit/API/PostgreSQL/browser/typecheck/lint/build verification is executed and failures disclosed. Independent teammate review and staged promotion remain required.
