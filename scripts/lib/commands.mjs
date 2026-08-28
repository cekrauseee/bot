export const commandSections = [
  {
    title: 'Start here',
    commands: [
      ['help', 'Show this command guide'],
      ['setup', 'Prepare a fresh development environment'],
      ['dev', 'Run the web, application API, and AI service together'],
    ],
  },
  {
    title: 'Verification',
    commands: [
      ['verify', 'Run the complete pre-PR verification'],
      ['check', 'Run checks and builds without integration services'],
    ],
  },
  {
    title: 'Operations',
    commands: [
      ['auth:check', 'Check Google and Resend environment variables'],
      ['db:generate', 'Generate a database migration from the API schema'],
      ['db:migrate', 'Apply pending database migrations'],
      ['db:check', 'Check the database migration history'],
      ['infra:start', 'Start PostgreSQL and Redis'],
      ['infra:stop', 'Stop PostgreSQL and Redis without deleting data'],
      ['infra:reset', 'Reset PostgreSQL and Redis containers and data'],
    ],
  },
  {
    title: 'API',
    commands: [
      ['api:dev', 'Run the Elysia API with reload'],
      ['api:lint', 'Lint the Elysia API'],
      ['api:typecheck', 'Type-check the Elysia API'],
      ['api:test', 'Run API unit tests'],
      ['api:test:integration', 'Run API integration tests'],
      ['api:build', 'Build the Elysia API'],
    ],
  },
  {
    title: 'AI service',
    commands: [
      ['ai:dev', 'Run the FastAPI AI service with reload'],
      ['ai:lint', 'Lint the Python AI service'],
      ['ai:test', 'Run AI service tests'],
    ],
  },
  {
    title: 'Web',
    commands: [
      ['web:dev', 'Run the Vite application'],
      ['web:lint', 'Lint the web application'],
      ['web:typecheck', 'Type-check the web application'],
      ['web:build', 'Type-check and build the web application'],
    ],
  },
  {
    title: 'Email',
    commands: [
      ['email:dev', 'Preview React Email templates'],
      ['email:typecheck', 'Type-check transactional email templates'],
      ['email:build', 'Build the transactional email workspace package'],
    ],
  },
  {
    title: 'Repository automation',
    commands: [
      ['scripts:lint', 'Lint repository automation scripts'],
      ['scripts:test', 'Test repository automation scripts'],
    ],
  },
]

export const commandNames = commandSections.flatMap(({ commands }) =>
  commands.map(([name]) => name),
)
