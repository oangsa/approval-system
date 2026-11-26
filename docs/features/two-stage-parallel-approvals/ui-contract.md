# UI contract

Version 1 — 2026-11-26. Contracts were written before source implementation. Implementation and test status are recorded in [verification](verification.md). Reuse the current policy editor, request Approval tab and actionable reviewer detail. Show ordered waiting, active, completed and cancelled stages and approved/remaining ALL counts from authorized server state. Waiting tasks cannot vote or appear in the actionable queue. Reuse confirmation dialogs, reason validation, stale reload and replay behavior; use authoritative server results/refetch.

Historical handled-task view stays restricted and must not fetch current approvers solely from prior handling. Preserve client-driven authenticated loading, private SSR boundaries, loading/error/empty states, keyboard/focus, responsive layout, localization and reduced-motion behavior per UI specification and styling contract.
