type ShutdownTask = () => Promise<unknown> | unknown

type ShutdownOptions = {
  stopServer: ShutdownTask
  closeResources: ShutdownTask[]
}

export function createShutdown({ stopServer, closeResources }: ShutdownOptions) {
  let shutdownPromise: Promise<void> | undefined

  return () => {
    shutdownPromise ??= (async () => {
      const serverResult = await Promise.allSettled([Promise.resolve().then(stopServer)])
      const resourceResults = await Promise.allSettled(closeResources.map((close) => close()))
      const failures = [...serverResult, ...resourceResults]
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => result.reason)
      if (failures.length) throw new AggregateError(failures, 'Failed to close API resources')
    })()
    return shutdownPromise
  }
}
