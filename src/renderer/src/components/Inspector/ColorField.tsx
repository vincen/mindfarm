import { useEffect, useRef } from 'react'
import { SWATCHES } from './shared'

interface ColorFieldProps {
  label: string
  /** Empty string means the node inherits the theme colour. */
  value: string
  /** Shown in the native picker while nothing is set. */
  fallback: string
  disabled?: boolean
  onChange: (value: string) => void
}

export function ColorField({
  label,
  value,
  fallback,
  disabled = false,
  onChange,
}: ColorFieldProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null)
  const commitRef = useRef(onChange)
  useEffect(() => {
    commitRef.current = onChange
  })

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    // React maps onChange to the `input` event, which fires continuously while the macOS
    // colour panel is open and would push one undo step per frame. `change` is the commit.
    const commit = (): void => commitRef.current(el.value)
    el.addEventListener('change', commit)
    return () => el.removeEventListener('change', commit)
  }, [])

  // Selecting another node (or undoing) has to move the picker back onto the real value.
  useEffect(() => {
    if (inputRef.current) inputRef.current.value = value || fallback
  }, [value, fallback])

  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-[12px] text-shell-muted">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            disabled={disabled}
            onClick={() => onChange(color)}
            style={{ backgroundColor: color }}
            className={`h-[18px] w-[18px] rounded-full border transition-transform disabled:opacity-40 ${
              value.toLowerCase() === color
                ? 'border-shell-text ring-2 ring-shell-text/30'
                : 'border-shell-border hover:scale-110'
            }`}
          >
            <span className="sr-only">{color}</span>
          </button>
        ))}
        <input
          ref={inputRef}
          type="color"
          disabled={disabled}
          defaultValue={value || fallback}
          title="自定义颜色"
          className="h-[18px] w-[24px] cursor-pointer rounded border border-shell-border bg-transparent p-0 disabled:opacity-40"
        />
        <button
          type="button"
          disabled={disabled || value === ''}
          onClick={() => onChange('')}
          className="rounded px-1 text-[11px] text-shell-muted transition-colors hover:bg-shell-hover hover:text-shell-text disabled:opacity-40 disabled:hover:bg-transparent"
        >
          默认
        </button>
      </div>
    </div>
  )
}
