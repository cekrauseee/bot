CREATE TABLE "agent_events" (
	"sequence" bigserial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"type" varchar(64) NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"assistant_message_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"model" varchar(32) NOT NULL,
	"provider" varchar(20) NOT NULL,
	"reasoning_effort" varchar(20) NOT NULL,
	"speed" varchar(20) NOT NULL,
	"plan" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pending_question" jsonb,
	"browser_projection" jsonb,
	"resume_input" jsonb,
	"reconciled_checkpoint_id" varchar(200),
	"execution_token" uuid,
	"last_event_sequence" bigint,
	"cancel_requested_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_agent_runs_turn_id" UNIQUE("turn_id"),
	CONSTRAINT "uq_agent_runs_assistant_message_id" UNIQUE("assistant_message_id")
);
--> statement-breakpoint
CREATE TABLE "agent_workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"runtime_provider" varchar(40) DEFAULT 'unassigned' NOT NULL,
	"runtime_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_agent_workspaces_user_id" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_agent_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."agent_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_assistant_message_id_messages_id_fk" FOREIGN KEY ("assistant_message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_workspaces" ADD CONSTRAINT "agent_workspaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_agent_events_run_id_sequence" ON "agent_events" USING btree ("run_id","sequence");--> statement-breakpoint
CREATE INDEX "ix_agent_runs_user_id_created_at" ON "agent_runs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_agent_runs_status_lease_expires_at" ON "agent_runs" USING btree ("status","lease_expires_at");