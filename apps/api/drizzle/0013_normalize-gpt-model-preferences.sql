UPDATE "users"
SET
  "default_model" = 'gpt-5.6-sol',
  "default_reasoning_effort" = 'medium',
  "default_speed" = 'standard',
  "updated_at" = now()
WHERE "default_model" NOT IN ('gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna');--> statement-breakpoint
UPDATE "conversations"
SET
  "model" = 'gpt-5.6-sol',
  "reasoning_effort" = 'medium',
  "speed" = 'standard',
  "model_updated_at" = now()
WHERE "model" NOT IN ('gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna');--> statement-breakpoint
UPDATE "messages"
SET
  "model" = 'gpt-5.6-sol',
  "reasoning_effort" = 'medium',
  "speed" = 'standard'
WHERE "model" IS NOT NULL
  AND "model" NOT IN ('gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna');--> statement-breakpoint
UPDATE "agent_runs"
SET
  "model" = 'gpt-5.6-sol',
  "provider" = 'openai',
  "reasoning_effort" = 'medium',
  "speed" = 'standard',
  "updated_at" = now()
WHERE "model" NOT IN ('gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna');
