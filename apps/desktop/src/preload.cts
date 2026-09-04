import { contextBridge, ipcRenderer } from 'electron'

export type DesktopBridge = {
  getPlatformInfo: () => Promise<{ platform: string; version: string }>
  startBrowserSignIn: () => Promise<void>
  clearDesktopSession: () => Promise<void>
  openExternalUrl: (url: string) => Promise<void>
  focusDesktopApp: () => Promise<void>
  onProviderConnectionCallback: (
    listener: (result: { provider: 'github'; status: 'connected' | 'error' }) => void,
  ) => () => void
}

const bridge: DesktopBridge = {
  getPlatformInfo: () => ipcRenderer.invoke('desktop:platform-info'),
  startBrowserSignIn: () => ipcRenderer.invoke('desktop:start-browser-sign-in'),
  clearDesktopSession: () => ipcRenderer.invoke('desktop:clear-session'),
  openExternalUrl: (url) => ipcRenderer.invoke('desktop:open-external-url', url),
  focusDesktopApp: () => ipcRenderer.invoke('desktop:focus-app'),
  onProviderConnectionCallback: (listener) => {
    const callback = (
      _event: Electron.IpcRendererEvent,
      result: { provider: 'github'; status: 'connected' | 'error' },
    ) => listener(result)
    ipcRenderer.on('desktop:provider-connection-callback', callback)
    return () => ipcRenderer.removeListener('desktop:provider-connection-callback', callback)
  },
}

contextBridge.exposeInMainWorld('myBotDesktop', bridge)
