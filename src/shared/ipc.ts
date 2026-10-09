export const IPC = {
  doc: {
    getInitial: 'doc:get-initial',
    save: 'doc:save',
    saveAs: 'doc:save-as',
    setDirty: 'doc:set-dirty',
    exportFile: 'doc:export',
    new: 'doc:new',
    openDialog: 'doc:open-dialog',
    /** main -> renderer */
    load: 'doc:load',
  },
  menu: {
    /** main -> renderer */
    action: 'menu:action',
  },
  theme: {
    get: 'theme:get',
    set: 'theme:set',
    /** main -> renderer */
    changed: 'theme:changed',
  },
  inspector: {
    get: 'inspector:get',
    set: 'inspector:set',
    /** main -> renderer */
    changed: 'inspector:changed',
  },
  window: {
    forceClose: 'window:force-close',
  },
  app: {
    openExternal: 'app:open-external',
  },
} as const
