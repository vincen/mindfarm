import { useCallback, useEffect } from 'react'
import { useDocumentStore } from '@renderer/store/document'

/**
 * The main process owns the panel's visibility so the View menu check mark, the
 * preference file and every open window stay in agreement.
 */
export function useInspector(): () => void {
  useEffect(() => {
    const apply = (open: boolean): void => useDocumentStore.getState().setInspectorOpen(open)
    void window.api.inspector.get().then(apply)
    return window.api.inspector.onChange(apply)
  }, [])

  return useCallback(() => {
    void window.api.inspector.set(!useDocumentStore.getState().inspectorOpen)
  }, [])
}
