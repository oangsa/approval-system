# Issue #11 acceptance criteria

These criteria were saved before implementation. Current execution and review dispositions are recorded in [verification](verification.md); RDT-AC12 remains a separate human review and release gate.

| ID | Acceptance |
| --- | --- |
| RDT-AC01 | Strict shared dashboard/report contracts reject unauthorized or unknown fields. |
| RDT-AC02 | All seven nonempty role combinations return exactly their authorized dashboard sections. |
| RDT-AC03 | Requester counts and capped recent list contain only own requests. |
| RDT-AC04 | Reviewer counts, tasks and own decisions obey current actionable scope and due boundary. |
| RDT-AC05 | Admin receives organization aggregates/configuration/escalation counts without private content or links. |
| RDT-AC06 | Reports deduplicate authorized scope, count positive groups and terminal outcomes accurately. |
| RDT-AC07 | Filters, Bangkok date bounds, stable sorting, pagination and snapshot totals meet the API contract. |
| RDT-AC08 | Timeline shows durable chronological actor/time/cycle/revision history and safe metadata. |
| RDT-AC09 | Former handlers gain no report or private detail rights; existing history permissions remain enforced. |
| RDT-AC10 | UI is accessible, handles stale responses, and has defined loading, empty and error states. |
| RDT-AC11 | Relevant unit, API, PostgreSQL, browser and concurrency evidence is recorded accurately. |
| RDT-AC12 | Independent teammate review and staged release workflow are completed before release. |
