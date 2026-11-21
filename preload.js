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
  chartHistory: value => ipcRenderer.invoke('desktop:chart-history', value),
  chartMinutes: code => ipcRenderer.invoke('desktop:chart-minutes', code),
  customSeries: (code, period, adjustment) => ipcRenderer.invoke('desktop:custom-series', code, period, adjustment),
  marketDetails: code => ipcRenderer.invoke('desktop:market-details', code),
  marketNews: (scope, code, force) => ipcRenderer.invoke('desktop:market-news', scope, code, force),
  openNews: id => ipcRenderer.invoke('desktop:open-news', id),
  translateNews: ids => ipcRenderer.invoke('desktop:translate-news', ids),
  newsPreferences: (operation, value) => ipcRenderer.invoke('desktop:news-preferences', operation, value),
  onNewsArrived: callback => subscribe('desktop:news-arrived', callback),
  refresh: () => ipcRenderer.invoke('desktop:refresh'),
  feedback: value => ipcRenderer.invoke('desktop:feedback', value),
  updates: operation => ipcRenderer.invoke('desktop:updates', operation),
  onUpdate: callback => subscribe('desktop:update', callback),
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
  onRefreshing: callback => subscribe('desktop:refreshing', callback),
  onKnock: callback => subscribe('desktop:knock', callback),
  onPreview: callback => subscribe('desktop:preview', callback),
  onCollapsed: callback => subscribe('desktop:collapsed', callback)
});
