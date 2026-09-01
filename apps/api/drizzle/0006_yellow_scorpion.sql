ALTER TABLE "agent_runs" ADD COLUMN "working_directory" text DEFAULT '/workspace' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "workspace_path" text;--> statement-breakpoint
UPDATE "projects"
SET "workspace_path" = '/workspace/projects/' || left("slug", 48) || '-' || "id"::text;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "workspace_path" SET NOT NULL;
