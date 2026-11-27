# Data contract

No DTO/table/permission changes. Intentional additive versioned indexes only, generated with Drizzle alongside schema changes. Use existing FK and current-cycle joins without duplicating slots. Counts and paged projections use one SQL statement; output approved summaries only. Timestamp comparisons bind UTC strings to PostgreSQL, preserving sub-millisecond boundaries. No concurrency locks or workflow mutation changes are required for read-only search.
