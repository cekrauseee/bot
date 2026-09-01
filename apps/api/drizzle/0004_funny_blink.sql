ALTER TABLE "conversations" ADD COLUMN "title_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "sort_order" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "order_updated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "ix_projects_user_id_sort_order" ON "projects" USING btree ("user_id","sort_order");