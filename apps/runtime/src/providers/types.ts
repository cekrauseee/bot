export type ProviderFactory = (workspaceId: string) => Promise<import('../contracts.js').RuntimeProvider>
