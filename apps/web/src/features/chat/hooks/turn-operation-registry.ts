import {
  conversationRouteKey,
  type ConversationRouteIdentity,
} from '../state/conversation-controller'

export type TurnOperation = {
  operationId: string
  controller: AbortController
  identity: ConversationRouteIdentity
}

export type TurnOperationRegistry = Map<string, TurnOperation>

export const findTurnOperation = (
  registry: TurnOperationRegistry,
  identity: ConversationRouteIdentity,
) => {
  const key = conversationRouteKey(identity)
  return [...registry.values()].find(
    (operation) => conversationRouteKey(operation.identity) === key,
  )
}

export const rekeyTurnOperation = (
  registry: TurnOperationRegistry,
  operationId: string,
  identity: ConversationRouteIdentity,
) => {
  const operation = registry.get(operationId)
  if (!operation) return undefined
  const rekeyed = { ...operation, identity }
  registry.set(operationId, rekeyed)
  return rekeyed
}

export const releaseTurnOperation = (
  registry: TurnOperationRegistry,
  operationId: string,
) => {
  const operation = registry.get(operationId)
  if (!operation) return undefined
  registry.delete(operationId)
  return operation
}
