import { Section } from './fields'
import type { NodeSectionProps } from './shared'

const ICONS = [
  '⭐',
  '🔥',
  '✅',
  '❌',
  '❗',
  '❓',
  '💡',
  '📌',
  '⏰',
  '🎯',
  '🚀',
  '⚠️',
  '❤️',
  '👍',
  '🔒',
  '📎',
] as const

export function IconsSection({ node, patch }: NodeSectionProps): React.ReactElement {
  const icons = node.icons ?? []

  const toggle = (icon: string): void => {
    const next = icons.includes(icon) ? icons.filter((item) => item !== icon) : [...icons, icon]
    patch({ icons: next.length > 0 ? next : undefined })
  }

  return (
    <Section title="图标">
      <div className="grid grid-cols-8 gap-1">
        {ICONS.map((icon) => (
          <button
            key={icon}
            type="button"
            onClick={() => toggle(icon)}
            className={`flex h-6 items-center justify-center rounded border text-[13px] transition-colors ${
              icons.includes(icon)
                ? 'border-transparent bg-shell-text/15'
                : 'border-transparent hover:bg-shell-hover'
            }`}
          >
            {icon}
          </button>
        ))}
      </div>
    </Section>
  )
}
