CREATE TYPE "public"."role_code" AS ENUM('REQUESTER', 'REVIEWER', 'ADMINISTRATOR');--> statement-breakpoint
CREATE TABLE "department_memberships" (
	"user_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "department_memberships_user_id_department_id_pk" PRIMARY KEY("user_id","department_id")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "refresh_tokens_expiry" CHECK ("refresh_tokens"."expires_at" > "refresh_tokens"."created_at")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"code" "role_code" PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_families" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"auth_version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "session_families_expiry" CHECK ("session_families"."expires_at" > "session_families"."created_at"),
	CONSTRAINT "session_families_auth_version_nonnegative" CHECK ("session_families"."auth_version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_code" "role_code" NOT NULL,
	CONSTRAINT "user_roles_user_id_role_code_pk" PRIMARY KEY("user_id","role_code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"auth_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_normalized" CHECK ("users"."email" = lower(btrim("users"."email"))),
	CONSTRAINT "users_auth_version_nonnegative" CHECK ("users"."auth_version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "department_memberships" ADD CONSTRAINT "department_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_memberships" ADD CONSTRAINT "department_memberships_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_family_id_session_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."session_families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_families" ADD CONSTRAINT "session_families_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_code_roles_code_fk" FOREIGN KEY ("role_code") REFERENCES "public"."roles"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "department_memberships_one_primary" ON "department_memberships" USING btree ("user_id") WHERE "department_memberships"."is_primary";--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_expiry_idx" ON "refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "session_families_user_idx" ON "session_families" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_families_expiry_idx" ON "session_families" USING btree ("expires_at");