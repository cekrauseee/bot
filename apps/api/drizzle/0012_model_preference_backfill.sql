UPDATE "conversations" SET "reasoning_effort" = CASE "model"
  WHEN 'grok-4.6' THEN 'high'
  WHEN 'glm-5.2' THEN 'high'
  ELSE 'medium'
END;--> statement-breakpoint
UPDATE "users" SET "default_reasoning_effort" = CASE "default_model"
  WHEN 'grok-4.6' THEN 'high'
  WHEN 'glm-5.2' THEN 'high'
  ELSE 'medium'
END;
