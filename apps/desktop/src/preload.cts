import { contextBridge, ipcRenderer } from 'electron'

export type DesktopBridge = {
  getPlatformInfo: () => Promise<{ platform: string; version: string }>
  startBrowserSignIn: () => Promise<void>
  clearDesktopSession: () => Promise<void>
  openExternalUrl: (url: string) => Promise<void>
}

const bridge: DesktopBridge = {
  getPlatformInfo: () => ipcRenderer.invoke('desktop:platform-info'),
  startBrowserSignIn: () => ipcRenderer.invoke('desktop:start-browser-sign-in'),
  clearDesktopSession: () => ipcRenderer.invoke('desktop:clear-session'),
  openExternalUrl: (url) => ipcRenderer.invoke('desktop:open-external-url', url),
}

contextBridge.exposeInMainWorld('myBotDesktop', bridge)
