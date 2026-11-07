CREATE TABLE "rate_limits" (
	"bucket" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_bucket_window_start_pk" PRIMARY KEY("bucket","window_start")
);
--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "header_type" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "header_media_url" text;--> statement-breakpoint
CREATE INDEX "rate_limits_window_start_index" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint
UPDATE "templates" SET "header_type" = 'text' WHERE "header_text" IS NOT NULL;