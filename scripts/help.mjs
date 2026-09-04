import { commandSections } from './lib/commands.mjs'

const commandWidth = Math.max(
  ...commandSections.flatMap(({ commands }) => commands.map(([name]) => name.length)),
)

console.log('Bot development commands')

for (const { title, commands } of commandSections) {
  console.log(`\n${title}`)
  for (const [name, description] of commands) {
    console.log(`  npm run ${name.padEnd(commandWidth)}  ${description}`)
  }
}
