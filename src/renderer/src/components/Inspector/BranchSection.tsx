import type { NodeObj } from 'mind-elixir'
import { ColorField } from './ColorField'
import { Section } from './fields'
import { sharedValue, type SectionProps } from './shared'

/** Only first-level nodes carry a branch colour; it then paints their whole subtree. */
function isMainBranch(node: NodeObj): boolean {
  return Boolean(node.parent && !node.parent.parent)
}

export function BranchSection({ nodes, patch }: SectionProps): React.ReactElement {
  const applicable = nodes.some(isMainBranch)
  const branchColor = sharedValue(nodes, (node) => node.branchColor)

  return (
    <Section
      title="分支"
      hint={
        applicable
          ? '分支颜色作用于该一级分支下的整条连线。'
          : '仅一级分支可设置颜色，当前选中的节点不在这一层。'
      }
    >
      <ColorField
        label="连线"
        value={branchColor}
        fallback="#0a84ff"
        disabled={!applicable}
        onChange={(next) => patch({ branchColor: next || undefined })}
      />
    </Section>
  )
}
