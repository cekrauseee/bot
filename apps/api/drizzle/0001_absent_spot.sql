CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"reasoning" text,
	"status" varchar(20) NOT NULL,
	"error_message" text,
	"model" varchar(20),
	"reasoning_effort" varchar(20),
	"speed" varchar(20),
	"activities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_conversations_user_id_updated_at" ON "conversations" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "ix_messages_conversation_id_created_at" ON "messages" USING btree ("conversation_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_messages_one_streaming_assistant" ON "messages" USING btree ("conversation_id") WHERE "role" = 'assistant' AND "status" = 'streaming';
