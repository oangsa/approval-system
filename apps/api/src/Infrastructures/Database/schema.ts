import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
