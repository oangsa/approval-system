# Issue #11 UI contract

Authenticated `/dashboard` and `/reports` use client-data loaders and shared API/services; no private data in SSR. Dashboard renders only role-authorized sections, stable capped lists and safe links. Former handlers use `/reviews/:taskId` for their own decisions; no universal detail grant. Administration exposes counts only. No charts or export controls in this increment.

Reports use committed validated URL filters, sorting and pagination. Filter dialog supports draft Apply, Cancel and reset; changed filters or sort reset page. Date controls interpret Bangkok start as inclusive and end as following-day exclusive UTC. Status uses enum choices; department choices are known authenticated department plus authorized aggregate groups; type discovery uses existing bounded endpoint. Do not introduce a broader lookup. Abort stale loads and guard responses by session generation. Render meaningful loading, empty, no-match, validation, forbidden, not-found, conflict and recoverable errors. Support keyboard operation, non-color status cues and responsive table/cards.

History renders accessible chronological `ol`/`time`, readable event labels with safe unknown-event fallback, actor and Bangkok time, and readable cycle/revision context. Changing request or context resets pagination. Follow styling and filter/search guidelines and existing pagination behavior.
