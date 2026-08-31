ALTER TABLE "conversations" ADD COLUMN "pinned_order" integer;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "pin_updated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "ix_conversations_user_id_pinned_order" ON "conversations" USING btree ("user_id","pinned_order");