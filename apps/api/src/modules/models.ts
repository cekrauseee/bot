export const modelCatalog = [
  {
    id: 'gpt-5.6-sol',
    provider: 'openai',
    label: 'GPT-5.6 Sol',
    reasoningEfforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    defaultReasoningEffort: 'medium',
    processingModes: ['standard', 'fast'],
    defaultProcessingMode: 'standard',
  },
  {
    id: 'gpt-5.6-terra',
    provider: 'openai',
    label: 'GPT-5.6 Terra',
    reasoningEfforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    defaultReasoningEffort: 'medium',
    processingModes: ['standard', 'fast'],
    defaultProcessingMode: 'standard',
  },
  {
    id: 'gpt-5.6-luna',
    provider: 'openai',
    label: 'GPT-5.6 Luna',
    reasoningEfforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    defaultReasoningEffort: 'medium',
    processingModes: ['standard', 'fast'],
    defaultProcessingMode: 'standard',
  },
  {
    id: 'grok-4.6',
    provider: 'xai',
    label: 'Grok 4.6',
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
    defaultReasoningEffort: 'high',
    processingModes: ['standard'],
    defaultProcessingMode: 'standard',
  },
  {
    id: 'grok-4.3',
    provider: 'xai',
    label: 'Grok 4.3',
    reasoningEfforts: ['none', 'low', 'medium', 'high'],
    defaultReasoningEffort: 'medium',
    processingModes: ['standard'],
    defaultProcessingMode: 'standard',
  },
] as const

export type ModelDefinition = (typeof modelCatalog)[number]
export type ModelName = ModelDefinition['id']
export type ModelProvider = ModelDefinition['provider']
export type ReasoningEffort = ModelDefinition['reasoningEfforts'][number]
export type ProcessingMode = ModelDefinition['processingModes'][number]

export const publicModelCatalog = () => ({
  models: modelCatalog.map((model) => ({
    id: model.id,
    provider: model.provider,
    label: model.label,
    reasoning_efforts: {
      options: [...model.reasoningEfforts],
      default: model.defaultReasoningEffort,
    },
    processing_modes: {
      options: [...model.processingModes],
      default: model.defaultProcessingMode,
    },
  })),
})

export const modelDefinition = (id: string) =>
  modelCatalog.find((model) => model.id === id)

export function validModelSelection(model: string, reasoningEffort: string, speed: string) {
  const definition = modelDefinition(model)
  return definition !== undefined &&
    (definition.reasoningEfforts as readonly string[]).includes(reasoningEffort) &&
    (definition.processingModes as readonly string[]).includes(speed)
}
