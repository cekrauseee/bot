ALTER TABLE "conversations" ADD COLUMN "reasoning_effort" varchar(20) DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "speed" varchar(20) DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "default_reasoning_effort" varchar(20) DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "default_speed" varchar(20) DEFAULT 'standard' NOT NULL;