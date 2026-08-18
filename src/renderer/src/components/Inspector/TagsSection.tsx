import { useState } from 'react'
import type { TagObj } from 'mind-elixir'
import { Section } from './fields'
import type { NodeSectionProps } from './shared'

function tagText(tag: string | TagObj): string {
  return typeof tag === 'string' ? tag : tag.text
}

export function TagsSection({ node, patch }: NodeSectionProps): React.ReactElement {
  const [draft, setDraft] = useState('')
  const tags = node.tags ?? []

  // Styled tags authored elsewhere stay as they are; only plain strings are added here.
  const commit = (next: (string | TagObj)[]): void =>
    patch({ tags: next.length > 0 ? next : undefined })

  const add = (): void => {
    const value = draft.trim()
    if (!value || tags.some((tag) => tagText(tag) === value)) {
      setDraft('')
      return
    }
    commit([...tags, value])
    setDraft('')
  }

  return (
    <Section title="标签">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag, index) => (
            <span
              key={`${tagText(tag)}-${index}`}
              className="flex items-center gap-1 rounded bg-shell-hover px-1.5 py-0.5 text-[11px] text-shell-text"
            >
              {tagText(tag)}
              <button
                type="button"
                title="移除标签"
                onClick={() => commit(tags.filter((_, i) => i !== index))}
                className="text-shell-muted transition-colors hover:text-shell-text"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={draft}
        placeholder="输入后回车添加"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            add()
          }
        }}
        onBlur={add}
        className="h-6 w-full rounded border border-shell-border bg-transparent px-1.5 text-[12px] text-shell-text placeholder:text-shell-muted"
      />
    </Section>
  )
}
