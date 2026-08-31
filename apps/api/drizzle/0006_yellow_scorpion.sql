ALTER TABLE "agent_runs" ADD COLUMN "working_directory" text DEFAULT '/workspace' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "workspace_path" text NOT NULL;