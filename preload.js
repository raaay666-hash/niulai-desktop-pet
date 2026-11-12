const { contextBridge, ipcRenderer } = require('electron');
const subscribe = (channel, callback) => {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('desktopPet', {
  bootstrap: legacy => ipcRenderer.invoke('desktop:bootstrap', legacy),
  settings: patch => ipcRenderer.invoke('desktop:settings', patch),
  stock: (operation, payload) => ipcRenderer.invoke('desktop:stock', operation, payload),
  search: query => ipcRenderer.invoke('desktop:search', query),
  refresh: () => ipcRenderer.invoke('desktop:refresh'),
  quoteSource: (operation, payload) => ipcRenderer.invoke('desktop:quote-source', operation, payload),
  knock: () => ipcRenderer.invoke('desktop:counts', false),
  newRound: () => ipcRenderer.invoke('desktop:counts', true),
  alerts: rules => ipcRenderer.invoke('desktop:alerts', rules),
  notify: body => ipcRenderer.invoke('desktop:notify', body),
  reportScene: value => ipcRenderer.invoke('desktop:scene', value),
  onMamaVoice: callback => subscribe('desktop:mama', callback),
  window: (action, value) => ipcRenderer.invoke('desktop:window', action, value),
  beginDrag: origin => ipcRenderer.invoke('desktop:drag-start', origin),
  endDrag: () => ipcRenderer.invoke('desktop:drag-end'),
  onSnapshot: callback => subscribe('desktop:snapshot', callback),
  onKnock: callback => subscribe('desktop:knock', callback),
  onPreview: callback => subscribe('desktop:preview', callback),
  onCollapsed: callback => subscribe('desktop:collapsed', callback)
});
