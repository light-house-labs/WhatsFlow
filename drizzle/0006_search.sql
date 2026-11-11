-- Global search: trigram matching on accent- and case-folded text.
-- unaccent() is only STABLE, so index expressions go through IMMUTABLE wrappers. Queries must use the same wrappers to hit the indexes.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.wf_norm(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, $1)) $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.wf_norm_tags(text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.wf_norm(array_to_string($1, ' ')) $$;--> statement-breakpoint
-- Product names in an order's items.
CREATE OR REPLACE FUNCTION public.wf_order_items_text(jsonb) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.wf_norm(jsonb_path_query_array($1, '$[*].name')::text) $$;--> statement-breakpoint
-- A bot flow's trigger keywords and every string in its nodes' data (message text, button labels, questions).
CREATE OR REPLACE FUNCTION public.wf_flow_text(jsonb, jsonb) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT public.wf_norm(
    coalesce(jsonb_path_query_array($1, 'strict $.keywords[*]')::text, '') || ' ' ||
    coalesce(jsonb_path_query_array($2, 'strict $.nodes[*].data.** ? (@.type() == "string")')::text, '')
  ) $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_search_name_trgm" ON "contacts" USING gin (public.wf_norm("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_search_phone_trgm" ON "contacts" USING gin ("wa_id" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_search_email_trgm" ON "contacts" USING gin (public.wf_norm("email") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_search_tags_trgm" ON "contacts" USING gin (public.wf_norm_tags("tags") gin_trgm_ops);--> statement-breakpoint
-- Conversations match on the contact's name and phone (contacts indexes above) and on the last message preview.
CREATE INDEX IF NOT EXISTS "conversations_search_preview_trgm" ON "conversations" USING gin (public.wf_norm("last_message_preview") gin_trgm_ops);--> statement-breakpoint
-- Messages keep the folded body in a stored column, so a common word matching thousands of rows
-- doesn't re-run unaccent on each one. Search reads the last 90 days; now() can't go in an index
-- predicate, so that filter is applied at query time.
ALTER TABLE "messages" ADD COLUMN "body_search" text GENERATED ALWAYS AS (public.wf_norm(body)) STORED;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_search_body_trgm" ON "messages" USING gin ("body_search" gin_trgm_ops) WHERE "body_search" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_search_title_trgm" ON "leads" USING gin (public.wf_norm("title") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_search_items_trgm" ON "orders" USING gin (public.wf_order_items_text("items") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_search_number_trgm" ON "orders" USING gin (("number"::text) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_search_subject_trgm" ON "tickets" USING gin (public.wf_norm("subject") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_search_number_trgm" ON "tickets" USING gin (("number"::text) gin_trgm_ops);--> statement-breakpoint
-- Appointments match on the contact's name (contacts index), the service name and the date.
CREATE INDEX IF NOT EXISTS "services_search_name_trgm" ON "services" USING gin (public.wf_norm("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_search_name_trgm" ON "products" USING gin (public.wf_norm("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_search_sku_trgm" ON "products" USING gin (public.wf_norm("sku") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_search_description_trgm" ON "products" USING gin (public.wf_norm("description") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "templates_search_name_trgm" ON "templates" USING gin (public.wf_norm("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "templates_search_body_trgm" ON "templates" USING gin (public.wf_norm("body") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_flows_search_name_trgm" ON "bot_flows" USING gin (public.wf_norm("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_flows_search_text_trgm" ON "bot_flows" USING gin (public.wf_flow_text("trigger", "graph") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_search_name_trgm" ON "campaigns" USING gin (public.wf_norm("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automations_search_name_trgm" ON "automations" USING gin (public.wf_norm("name") gin_trgm_ops);
