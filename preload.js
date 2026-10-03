const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('cfg:get'),
  saveConfig: (patch) => ipcRenderer.invoke('cfg:save', patch),
  complete: (req) => ipcRenderer.invoke('llm:complete', req),
  saveFile: (name, text) => ipcRenderer.invoke('file:save', name, text),
  openFiles: () => ipcRenderer.invoke('file:open'),
  atl: {
    comment: (r) => ipcRenderer.invoke('atl:comment', r),
    create: (r) => ipcRenderer.invoke('atl:create', r),
    jql: (r) => ipcRenderer.invoke('atl:jql', r),
    get: () => ipcRenderer.invoke('atl:get'),
    save: (p) => ipcRenderer.invoke('atl:save', p),
    test: () => ipcRenderer.invoke('atl:test'),
    issue: (r) => ipcRenderer.invoke('atl:issue', r),
    issues: (r) => ipcRenderer.invoke('atl:issues', r),
    confSearch: (r) => ipcRenderer.invoke('atl:confSearch', r),
    confPage: (id) => ipcRenderer.invoke('atl:confPage', id),
  },
});
