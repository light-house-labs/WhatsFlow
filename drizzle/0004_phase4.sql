CREATE TABLE "abandoned_carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"contact_id" uuid,
	"url" text,
	"total_minor" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"accepts_marketing" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"match" text NOT NULL,
	"values" text[] NOT NULL,
	"assign_mode" text DEFAULT 'none' NOT NULL,
	"assignee_id" uuid,
	"label" text,
	"active" boolean DEFAULT true NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "vars" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "payment_reminder_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "wa_numbers" ADD COLUMN "profile" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "abandoned_carts" ADD CONSTRAINT "abandoned_carts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abandoned_carts" ADD CONSTRAINT "abandoned_carts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "abandoned_carts_org_source_ext_idx" ON "abandoned_carts" USING btree ("org_id","source","external_id");--> statement-breakpoint
CREATE INDEX "routing_rules_org_id_position_index" ON "routing_rules" USING btree ("org_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_org_source_external_idx" ON "orders" USING btree ("org_id","source","external_id") WHERE "orders"."external_id" is not null;