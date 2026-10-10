import { useEffect } from 'react'

interface ImageViewerProps {
  src: string
  onClose: () => void
}

/** Full-window view of a node's picture. Clicking the backdrop or pressing Esc closes it. */
export function ImageViewer({ src, onClose }: ImageViewerProps): React.ReactElement {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      data-original-viewer
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className="max-h-[90%] max-w-[90%] object-contain"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  )
}
