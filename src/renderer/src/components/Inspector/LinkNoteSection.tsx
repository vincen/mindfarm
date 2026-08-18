import { DebouncedInput, DebouncedTextarea } from './DebouncedField'
import { Section } from './fields'
import type { NodeSectionProps } from './shared'

export function LinkNoteSection({ node, patch }: NodeSectionProps): React.ReactElement {
  return (
    <Section title="链接与备注" hint="有备注的节点会在右上角显示一个圆点。">
      <DebouncedInput
        type="url"
        value={node.hyperLink ?? ''}
        placeholder="https://"
        onCommit={(next) => patch({ hyperLink: next.trim() || undefined })}
      />
      <DebouncedTextarea
        value={node.note ?? ''}
        placeholder="备注"
        onCommit={(next) => patch({ note: next.trim() || undefined })}
      />
    </Section>
  )
}
