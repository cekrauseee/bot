export const commandSections = [
  {
    title: 'Start here',
    commands: [
      ['help', 'Show this command guide'],
      ['setup', 'Prepare a fresh development environment'],
      ['dev', 'Run the API and web application together'],
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
      ['db:migrate', 'Apply pending database migrations'],
      ['infra:start', 'Start PostgreSQL and Redis'],
      ['infra:stop', 'Stop PostgreSQL and Redis without deleting data'],
    ],
  },
  {
    title: 'API',
    commands: [
      ['api:dev', 'Run FastAPI with reload'],
      ['api:lint', 'Lint the Python service'],
      ['api:test', 'Run API unit tests'],
    ],
  },
  {
    title: 'Web',
    commands: [
      ['web:dev', 'Run the Vite application'],
      ['web:lint', 'Lint the web application'],
      ['web:build', 'Type-check and build the web application'],
    ],
  },
  {
    title: 'Emails',
    commands: [
      ['emails:dev', 'Preview React Email templates'],
      ['emails:render', 'Render local API email artifacts from React'],
      ['emails:check', 'Check local email artifacts for source drift'],
      ['emails:typecheck', 'Type-check transactional email templates'],
      ['emails:build', 'Build the React Email preview application'],
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
