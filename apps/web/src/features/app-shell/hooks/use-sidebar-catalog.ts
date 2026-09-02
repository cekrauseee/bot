import { useCallback, useEffect, useRef, useState } from "react"

import {
  appShellApi,
  type ActiveTitleRun,
  type ConversationSummary,
  type ProjectSummary,
} from "@/features/app-shell/api"
import {
  mergeConversationCatalog,
  mergeConversationTitle,
} from "@/features/app-shell/conversation-metadata"
import { apiErrorMessage } from "@/lib/api"
import type { ComposerModel } from "@/features/composer/model-catalog"

type SidebarCatalog = {
  activeRuns: ActiveTitleRun[]
  conversations: ConversationSummary[]
  models: ComposerModel[]
  projects: ProjectSummary[]
}

const emptyCatalog: SidebarCatalog = {
  activeRuns: [],
  conversations: [],
  models: [],
  projects: [],
}

export function useSidebarCatalog(enabled: boolean) {
  const [catalog, setCatalog] = useState<SidebarCatalog>(emptyCatalog)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set())
  const requestId = useRef(0)

  const refresh = useCallback(
    async (options?: { preserveActionError?: boolean }) => {
      const currentRequest = ++requestId.current
      setLoading(true)
      setCatalogError(null)
      if (!options?.preserveActionError) setActionError(null)

      try {
        const nextCatalog = await appShellApi.catalog()
        if (currentRequest === requestId.current) {
          setCatalog((current) => ({
            activeRuns: nextCatalog.activeRuns,
            conversations: mergeConversationCatalog(
              current.conversations,
              nextCatalog.conversations
            ),
            models: nextCatalog.models,
            projects: nextCatalog.projects,
          }))
        }
      } catch (error) {
        if (currentRequest === requestId.current) {
          setCatalogError(
            apiErrorMessage(error, "Unable to load conversations and projects.")
          )
        }
      } finally {
        if (currentRequest === requestId.current) {
          setLoaded(true)
          setLoading(false)
        }
      }
    },
    []
  )

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void refresh()
    })
    return () => {
      cancelled = true
      requestId.current += 1
    }
  }, [enabled, refresh])

  useEffect(() => {
    if (!enabled) return
    const refreshProviders = () => void refresh({ preserveActionError: true })
    window.addEventListener("provider-connections:changed", refreshProviders)
    return () =>
      window.removeEventListener(
        "provider-connections:changed",
        refreshProviders
      )
  }, [enabled, refresh])

  const runMutation = useCallback(
    async <T>(
      key: string,
      fallbackError: string,
      request: () => Promise<T>,
      apply: (result: T) => void,
      reportGlobally = true
    ) => {
      setActionError(null)
      setPendingKeys((current) => new Set(current).add(key))

      try {
        const result = await request()
        apply(result)
        return result
      } catch (error) {
        if (reportGlobally) {
          setActionError(apiErrorMessage(error, fallbackError))
        }
        throw error
      } finally {
        setPendingKeys((current) => {
          const next = new Set(current)
          next.delete(key)
          return next
        })
      }
    },
    []
  )

  const replaceConversation = useCallback((next: ConversationSummary) => {
    setCatalog((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === next.id
          ? mergeConversationTitle(conversation, next)
          : conversation
      ),
    }))
  }, [])

  const upsertConversation = useCallback((next: ConversationSummary) => {
    setCatalog((current) => {
      const exists = current.conversations.some(
        (conversation) => conversation.id === next.id
      )

      return {
        ...current,
        conversations: exists
          ? current.conversations.map((conversation) =>
              conversation.id === next.id
                ? mergeConversationTitle(conversation, next)
                : conversation
            )
          : [next, ...current.conversations],
      }
    })
  }, [])

  const replaceProject = useCallback((next: ProjectSummary) => {
    setCatalog((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === next.id ? next : project
      ),
    }))
  }, [])

  const createProject = useCallback(
    (name: string) =>
      runMutation(
        "project:create",
        "Unable to create this project. Try again.",
        () => appShellApi.createProject(name),
        (project) =>
          setCatalog((current) => ({
            ...current,
            projects: [...current.projects, project],
          })),
        false
      ),
    [runMutation]
  )

  const deleteConversation = useCallback(
    (conversationId: string) =>
      runMutation(
        `conversation:${conversationId}`,
        "Unable to delete this conversation. Try again.",
        () => appShellApi.deleteConversation(conversationId),
        () =>
          setCatalog((current) => ({
            ...current,
            conversations: current.conversations.filter(
              (conversation) => conversation.id !== conversationId
            ),
          })),
        false
      ),
    [runMutation]
  )

  const deleteProject = useCallback(
    (projectId: string) =>
      runMutation(
        `project:${projectId}`,
        "Unable to delete this project. Try again.",
        () => appShellApi.deleteProject(projectId),
        () =>
          setCatalog((current) => ({
            ...current,
            conversations: current.conversations.map((conversation) =>
              conversation.project_id === projectId
                ? { ...conversation, project_id: null }
                : conversation
            ),
            projects: current.projects.filter(
              (project) => project.id !== projectId
            ),
          })),
        false
      ),
    [runMutation]
  )

  const moveConversation = useCallback(
    async (conversationId: string, projectId: string | null) => {
      try {
        return await runMutation(
          `conversation:${conversationId}`,
          "Unable to move this conversation. Try again.",
          () => appShellApi.moveConversation(conversationId, projectId),
          replaceConversation
        )
      } catch {
        return null
      }
    },
    [replaceConversation, runMutation]
  )

  const renameConversation = useCallback(
    (conversationId: string, title: string) =>
      runMutation(
        `conversation:${conversationId}`,
        "Unable to rename this conversation. Try again.",
        () => appShellApi.renameConversation(conversationId, title),
        replaceConversation,
        false
      ),
    [replaceConversation, runMutation]
  )

  const setConversationModel = useCallback(
    (conversationId: string, model: string) =>
      runMutation(
        `conversation-model:${conversationId}`,
        "Unable to save this conversation model. Try again.",
        () => appShellApi.setConversationModel(conversationId, model),
        replaceConversation,
        false
      ),
    [replaceConversation, runMutation]
  )

  const renameProject = useCallback(
    (projectId: string, name: string) =>
      runMutation(
        `project:${projectId}`,
        "Unable to rename this project. Try again.",
        () => appShellApi.renameProject(projectId, name),
        replaceProject,
        false
      ),
    [replaceProject, runMutation]
  )

  const setConversationPinned = useCallback(
    async (conversationId: string, pinned: boolean) => {
      try {
        return await runMutation(
          `conversation:${conversationId}`,
          `Unable to ${pinned ? "pin" : "unpin"} this conversation. Try again.`,
          () => appShellApi.setConversationPinned(conversationId, pinned),
          replaceConversation
        )
      } catch {
        return null
      }
    },
    [replaceConversation, runMutation]
  )

  const reorderPinnedConversations = useCallback(
    async (conversationIds: string[]) => {
      try {
        return await runMutation(
          "conversation-order",
          "Unable to reorder pinned conversations. Try again.",
          () => appShellApi.reorderPinnedConversations(conversationIds),
          ({ conversations }) => {
            const replacements = new Map(
              conversations.map((conversation) => [
                conversation.id,
                conversation,
              ])
            )
            setCatalog((current) => ({
              ...current,
              conversations: current.conversations.map((conversation) =>
                replacements.has(conversation.id)
                  ? mergeConversationTitle(
                      conversation,
                      replacements.get(conversation.id)!
                    )
                  : conversation
              ),
            }))
          }
        )
      } catch {
        void refresh({ preserveActionError: true })
        return null
      }
    },
    [refresh, runMutation]
  )

  const reorderProjects = useCallback(
    async (projectIds: string[]) => {
      try {
        return await runMutation(
          "project-order",
          "Unable to reorder projects. Try again.",
          () => appShellApi.reorderProjects(projectIds),
          ({ projects }) => setCatalog((current) => ({ ...current, projects }))
        )
      } catch {
        void refresh({ preserveActionError: true })
        return null
      }
    },
    [refresh, runMutation]
  )

  const isPending = useCallback(
    (kind: "conversation" | "project", id: string) =>
      loading ||
      pendingKeys.has(`${kind}:${id}`) ||
      pendingKeys.has(`${kind}-order`),
    [loading, pendingKeys]
  )

  return {
    ...catalog,
    actionError,
    catalogError,
    createProject,
    deleteConversation,
    deleteProject,
    isPending,
    loading: enabled && (!loaded || loading),
    moveConversation,
    refresh,
    renameConversation,
    renameProject,
    reorderPinnedConversations,
    reorderProjects,
    setConversationModel,
    setConversationPinned,
    upsertConversation,
  }
}

export type SidebarCatalogController = ReturnType<typeof useSidebarCatalog>
