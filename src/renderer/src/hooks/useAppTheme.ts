import { useEffect, useState } from 'react'
import type { MindElixirInstance } from 'mind-elixir'
import type { ThemeState } from '@shared/types'
import { darkTheme, lightTheme } from '@renderer/themes'

/**
 * Mind Elixir deliberately ignores `prefers-color-scheme`, so the main process is the
 * single source of truth and the theme is pushed into the instance by hand.
 */
export function useAppTheme(instance: MindElixirInstance | null): ThemeState {
  const [state, setState] = useState<ThemeState>({ preference: 'system', dark: false })

  useEffect(() => {
    void window.api.theme.get().then(setState)
    return window.api.theme.onChange(setState)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.dark)
  }, [state.dark])

  useEffect(() => {
    if (!instance) return
    instance.changeTheme(state.dark ? darkTheme : lightTheme, true)
  }, [instance, state.dark])

  return state
}
