import type { IStageDefinition } from "../../Domains/Requests/RequestRules";
import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, numeric, pgEnum, pgSequence, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

export const roleCode = pgEnum("role_code", ["REQUESTER", "REVIEWER", "ADMINISTRATOR"]);
export const users = pgTable("users", {
    id: uuid().primaryKey(), email: text().notNull().unique(), displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(), isActive: boolean("is_active").notNull().default(true),
    authVersion: integer("auth_version").notNull().default(0), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [check("users_email_normalized", sql`${table.email} = lower(btrim(${table.email}))`), check("users_auth_version_nonnegative", sql`${table.authVersion} >= 0`)]);
export const roles = pgTable("roles", { code: roleCode().primaryKey() });
export const userRoles = pgTable("user_roles", {
    userId: uuid("user_id").notNull().references(() => users.id), roleCode: roleCode("role_code").notNull().references(() => roles.code),
}, (table) => [primaryKey({ columns: [table.userId, table.roleCode] })]);
export const departments = pgTable("departments", {
    id: uuid().primaryKey(), code: text().notNull().unique(), name: text().notNull(), isActive: boolean("is_active").notNull().default(true),
});
export const departmentMemberships = pgTable("department_memberships", {
    userId: uuid("user_id").notNull().references(() => users.id), departmentId: uuid("department_id").notNull().references(() => departments.id),
    isPrimary: boolean("is_primary").notNull().default(false), isActive: boolean("is_active").notNull().default(true),
}, (table) => [primaryKey({ columns: [table.userId, table.departmentId] }), uniqueIndex("department_memberships_one_primary").on(table.userId).where(sql`${table.isPrimary}`)]);
export const sessionFamilies = pgTable("session_families", {
    id: uuid().primaryKey(), userId: uuid("user_id").notNull().references(() => users.id), authVersion: integer("auth_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [check("session_families_expiry", sql`${table.expiresAt} > ${table.createdAt}`), check("session_families_auth_version_nonnegative", sql`${table.authVersion} >= 0`), index("session_families_user_idx").on(table.userId), index("session_families_expiry_idx").on(table.expiresAt)]);
export const refreshTokens = pgTable("refresh_tokens", {
    id: uuid().primaryKey(), familyId: uuid("family_id").notNull().references(() => sessionFamilies.id), tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), consumedAt: timestamp("consumed_at", { withTimezone: true }),
}, (table) => [check("refresh_tokens_expiry", sql`${table.expiresAt} > ${table.createdAt}`), index("refresh_tokens_family_idx").on(table.familyId), index("refresh_tokens_expiry_idx").on(table.expiresAt)]);

// Immutable version JSON holds the published form graph; lifecycle rows remain relational.
export const requestTypes = pgTable("request_types", {
    id: uuid().primaryKey(), code: text().notNull().unique(), isEnabled: boolean("is_enabled").notNull().default(true),
    publishedVersionId: uuid("published_version_id").references((): AnyPgColumn => requestTypeVersions.id),
});
export const requestTypeVersions = pgTable("request_type_versions", {
    id: uuid().primaryKey(), typeId: uuid("type_id").notNull().references(() => requestTypes.id), versionNumber: integer("version_number").notNull(),
    definition: jsonb().$type<import("@workflow/contracts").PublishedRequestType>().notNull(),
}, (t) => [unique().on(t.typeId, t.versionNumber), unique().on(t.typeId, t.id), check("type_version_positive", sql`${t.versionNumber} > 0`)]);
export const approvalPolicyVersions = pgTable("approval_policy_versions", {
    id: uuid().primaryKey(), code: text().notNull(), versionNumber: integer("version_number").notNull(), typeId: uuid("type_id").notNull().references(() => requestTypes.id),
    departmentId: uuid("department_id").references(() => departments.id), priority: integer().notNull(), isActive: boolean("is_active").notNull().default(true),
    minAmount: numeric("min_amount", { precision: 24, scale: 2 }), maxAmount: numeric("max_amount", { precision: 24, scale: 2 }), stages: jsonb().$type<IStageDefinition[]>().notNull(),
}, (t) => [unique().on(t.code, t.versionNumber)]);
export const reviewerAssignmentRules = pgTable("reviewer_assignment_rules", {
    id: uuid().primaryKey(), assignmentKey: text("assignment_key").notNull(), departmentId: uuid("department_id").notNull().references(() => departments.id),
    reviewerId: uuid("reviewer_id").notNull().references(() => users.id), isActive: boolean("is_active").notNull().default(true), version: integer().notNull().default(0),
}, (t) => [unique().on(t.assignmentKey, t.departmentId)]);
export const budgetPolicies = pgTable("budget_policies", {
    id: uuid().primaryKey(), typeId: uuid("type_id").notNull().references(() => requestTypes.id), departmentId: uuid("department_id").references(() => departments.id),
    maxAmount: numeric("max_amount", { precision: 24, scale: 2 }).notNull(), isActive: boolean("is_active").notNull().default(true),
}, (t) => [check("budget_nonnegative", sql`${t.maxAmount} >= 0`), uniqueIndex("one_type_budget").on(t.typeId).where(sql`${t.isActive} AND ${t.departmentId} IS NULL`), uniqueIndex("one_department_budget").on(t.typeId, t.departmentId).where(sql`${t.isActive} AND ${t.departmentId} IS NOT NULL`)]);
export const requestNumberSequence = pgSequence("request_number_sequence");
export const requests = pgTable("requests", {
    id: uuid().primaryKey(), requesterId: uuid("requester_id").notNull().references(() => users.id), typeId: uuid("type_id").notNull().references(() => requestTypes.id),
    departmentId: uuid("department_id").references(() => departments.id), departmentSnapshot: jsonb("department_snapshot").$type<import("@workflow/contracts").DepartmentSummary>(),
    requestNumber: text("request_number").unique(), title: text().notNull(), justification: text().notNull(), priority: text().$type<import("@workflow/contracts").RequestDetail["priority"]>().notNull(),
    status: text().$type<import("@workflow/contracts").RequestDetail["status"]>().notNull().default("DRAFT"), version: integer().notNull().default(0),
    workingRevisionId: uuid("working_revision_id").references((): AnyPgColumn => requestRevisions.id), submittedRevisionId: uuid("submitted_revision_id").references((): AnyPgColumn => requestRevisions.id),
    currentCycleId: uuid("current_cycle_id").references((): AnyPgColumn => approvalCycles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(), submittedAt: timestamp("submitted_at", { withTimezone: true }),
}, (t) => [check("request_status", sql`${t.status} in ('DRAFT','PENDING','RETURNED','APPROVED','REJECTED','WITHDRAWN')`), check("request_priority", sql`${t.priority} in ('LOW','MEDIUM','HIGH','URGENT')`), check("request_version_nonnegative", sql`${t.version} >= 0`), index("request_owner_idx").on(t.requesterId), index("request_owner_updated_id_idx").on(t.requesterId, t.updatedAt.desc(), t.id.asc())]);
export const requestRevisions = pgTable("request_revisions", {
    id: uuid().primaryKey(), requestId: uuid("request_id").notNull().references(() => requests.id), typeId: uuid("type_id").notNull(), formDefinitionVersionId: uuid("form_definition_version_id").notNull(),
    revisionNumber: integer("revision_number").notNull(), fields: jsonb().$type<Record<string, unknown>>().notNull(), amount: numeric({ precision: 24, scale: 2 }), currency: text(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }), submittedBy: uuid("submitted_by").references(() => users.id),
}, (t) => [unique().on(t.requestId, t.revisionNumber), foreignKey({ columns: [t.typeId, t.formDefinitionVersionId], foreignColumns: [requestTypeVersions.typeId, requestTypeVersions.id] }), check("revision_positive", sql`${t.revisionNumber} > 0`), check("revision_amount_nonnegative", sql`${t.amount} >= 0`)]);
export const requestItems = pgTable("request_items", {
    id: uuid().primaryKey(), revisionId: uuid("revision_id").notNull().references(() => requestRevisions.id), description: text().notNull(),
    quantity: numeric({ precision: 24, scale: 6 }).notNull(), unitAmount: numeric("unit_amount", { precision: 24, scale: 2 }).notNull(), totalAmount: numeric("total_amount", { precision: 24, scale: 2 }).notNull(),
}, (t) => [check("item_quantity_positive", sql`${t.quantity} > 0`), check("item_amount_nonnegative", sql`${t.unitAmount} >= 0 AND ${t.totalAmount} >= 0`)]);
export const approvalCycles = pgTable("approval_cycles", {
    id: uuid().primaryKey(), requestId: uuid("request_id").notNull().references(() => requests.id), revisionId: uuid("revision_id").notNull().unique().references(() => requestRevisions.id),
    policyVersionId: uuid("policy_version_id").notNull().references(() => approvalPolicyVersions.id), snapshot: jsonb().$type<Record<string, unknown>>().notNull(),
    isActive: boolean("is_active").notNull().default(true), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("one_active_cycle").on(t.requestId).where(sql`${t.isActive}`)]);
export const approvalStages = pgTable("approval_stages", {
    id: uuid().primaryKey(), cycleId: uuid("cycle_id").notNull().references(() => approvalCycles.id), stageNumber: integer("stage_number").$type<1 | 2>().notNull(),
    status: text().notNull(), slaBusinessMinutes: integer("sla_business_minutes").notNull(),
}, (t) => [unique().on(t.cycleId, t.stageNumber), check("stage_number_range", sql`${t.stageNumber} in (1,2)`)]);
export const approvalSlots = pgTable("approval_slots", {
    id: uuid().primaryKey(), stageId: uuid("stage_id").notNull().references(() => approvalStages.id), reviewerId: uuid("reviewer_id").notNull().references(() => users.id),
    assignmentKey: text("assignment_key").notNull(), status: text().$type<import("@workflow/contracts").RequestDetail["currentApprovers"][number]["status"]>().notNull(), version: integer().notNull().default(0), dueAt: timestamp("due_at", { withTimezone: true }),
}, (t) => [unique().on(t.stageId, t.assignmentKey), index("approval_slot_reviewer_status_idx").on(t.reviewerId, t.status)]);
export const requestAuditEvents = pgTable("audit_events", {
    id: uuid().primaryKey(), requestId: uuid("request_id").notNull().references(() => requests.id), actorId: uuid("actor_id").notNull().references(() => users.id),
    eventType: text("event_type").notNull(), revisionId: uuid("revision_id").references(() => requestRevisions.id), cycleId: uuid("cycle_id").references(() => approvalCycles.id), occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});
export const requestOutboxEvents = pgTable("outbox_events", {
    id: uuid().primaryKey(), eventKey: text("event_key").notNull().unique(), eventType: text("event_type").notNull(), payload: jsonb().$type<{ requestId: string; cycleId: string }>().notNull(), processedAt: timestamp("processed_at", { withTimezone: true }),
});
export const idempotencyRecords = pgTable("idempotency_records", {
    actorId: uuid("actor_id").notNull().references(() => users.id), scope: text().notNull(), key: uuid().notNull(), bodyHash: text("body_hash").notNull(),
    response: jsonb().$type<import("@workflow/contracts").RequestDetail>().notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.actorId, t.scope, t.key] })]);
