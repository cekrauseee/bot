ALTER TABLE "users" ADD COLUMN "default_model" varchar(32) DEFAULT 'gpt-5.6-sol' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "model" varchar(32);--> statement-breakpoint
UPDATE "conversations" AS "conversation"
SET "model" = COALESCE(
	(
		SELECT "message"."model"
		FROM "messages" AS "message"
		WHERE "message"."conversation_id" = "conversation"."id"
			AND "message"."role" = 'assistant'
			AND "message"."model" IS NOT NULL
		ORDER BY "message"."created_at" DESC, "message"."id" DESC
		LIMIT 1
	),
	"user"."default_model"
)
FROM "users" AS "user"
WHERE "user"."id" = "conversation"."user_id";--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "model" SET NOT NULL;
