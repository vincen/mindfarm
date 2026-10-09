import { useState } from 'react'
import { asImageBytes, blobFromBytes, bytesToNodeImage } from '@renderer/image-node'
import { Section } from './fields'
import type { NodeSectionProps } from './shared'

const BUTTON_CLASS =
  'h-6 rounded border border-shell-border px-2 text-[12px] text-shell-text transition-colors hover:bg-shell-hover disabled:opacity-50'

export function ImageSection({ node, patch }: NodeSectionProps): React.ReactElement {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const image = node.image

  const choose = async (): Promise<void> => {
    setError(null)
    const picked = await window.api.doc.pickImage()
    if (!picked) return

    setBusy(true)
    try {
      const next = await bytesToNodeImage(blobFromBytes(asImageBytes(picked.bytes), picked.mime))
      patch({ image: next })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法插入这张图片')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="图片" hint="图片会缩小后嵌进文档，换一台电脑打开仍然在。可以从剪贴板粘贴。">
      {image?.url ? (
        <img src={image.url} alt="" className="max-h-24 w-full rounded object-contain" />
      ) : null}
      <div className="flex gap-1">
        <button type="button" onClick={() => void choose()} disabled={busy} className={BUTTON_CLASS}>
          {busy ? '处理中…' : image?.url ? '更换' : '选择图片'}
        </button>
        {image?.url ? (
          <button
            type="button"
            title="移除图片"
            onClick={() => patch({ image: null })}
            className={BUTTON_CLASS}
          >
            移除
          </button>
        ) : null}
      </div>
      {error ? <p className="text-[11px] leading-snug text-[#ff453a]">{error}</p> : null}
    </Section>
  )
}
