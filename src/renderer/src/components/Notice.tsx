import { useEffect } from 'react'

interface NoticeProps {
  message: string | null
  onDismiss: () => void
}

export function Notice({ message, onDismiss }: NoticeProps): React.ReactElement | null {
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(onDismiss, 5000)
    return () => window.clearTimeout(timer)
  }, [message, onDismiss])

  if (!message) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
      <button
        type="button"
        onClick={onDismiss}
        className="pointer-events-auto rounded-lg border border-shell-border bg-shell px-4 py-2 text-[12px] text-shell-text shadow-lg"
      >
        {message}
      </button>
    </div>
  )
}
