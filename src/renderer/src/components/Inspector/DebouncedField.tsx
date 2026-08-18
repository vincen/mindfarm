import { useCallback, useEffect, useRef } from 'react'

interface Handlers {
  onInput: () => void
  onBlur: () => void
}

/**
 * Every commit pushes an entry onto the map's undo stack, so free text lives in the DOM
 * node and is only handed over once typing pauses or the field loses focus. Keeping the
 * field uncontrolled also means an in-flight edit never round-trips through React.
 */
function useDebouncedCommit(
  ref: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
  value: string,
  commit: (next: string) => void,
  delay: number,
): Handlers {
  const timer = useRef<number | null>(null)
  const latest = useRef({ value, commit })
  useEffect(() => {
    latest.current = { value, commit }
  })

  // Undo, or a change made elsewhere, has to win over whatever the field is showing.
  useEffect(() => {
    const el = ref.current
    if (el && el.value !== value && document.activeElement !== el) el.value = value
  }, [ref, value])

  const flush = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    const el = ref.current
    if (el && el.value !== latest.current.value) latest.current.commit(el.value)
  }, [ref])

  useEffect(() => () => flush(), [flush])

  const onInput = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, delay)
  }, [flush, delay])

  return { onInput, onBlur: flush }
}

const FIELD_CLASS =
  'w-full rounded border border-shell-border bg-transparent px-1.5 text-[12px] text-shell-text placeholder:text-shell-muted'

const COMMIT_DELAY = 500

export function DebouncedInput({
  value,
  placeholder,
  type = 'text',
  onCommit,
}: {
  value: string
  placeholder: string
  type?: string
  onCommit: (next: string) => void
}): React.ReactElement {
  const ref = useRef<HTMLInputElement>(null)
  const handlers = useDebouncedCommit(ref, value, onCommit, COMMIT_DELAY)

  return (
    <input
      ref={ref}
      type={type}
      defaultValue={value}
      placeholder={placeholder}
      onInput={handlers.onInput}
      onBlur={handlers.onBlur}
      className={`h-6 ${FIELD_CLASS}`}
    />
  )
}

export function DebouncedTextarea({
  value,
  placeholder,
  rows = 4,
  onCommit,
}: {
  value: string
  placeholder: string
  rows?: number
  onCommit: (next: string) => void
}): React.ReactElement {
  const ref = useRef<HTMLTextAreaElement>(null)
  const handlers = useDebouncedCommit(ref, value, onCommit, COMMIT_DELAY)

  return (
    <textarea
      ref={ref}
      rows={rows}
      defaultValue={value}
      placeholder={placeholder}
      onInput={handlers.onInput}
      onBlur={handlers.onBlur}
      className={`resize-none py-1 leading-snug ${FIELD_CLASS}`}
    />
  )
}
