import type { NodeObj } from 'mind-elixir'
import type { NodePatch } from '@renderer/node-patch'
import { BranchSection } from './BranchSection'
import { IconsSection } from './IconsSection'
import { ImageSection } from './ImageSection'
import { LinkNoteSection } from './LinkNoteSection'
import { StyleSection } from './StyleSection'
import { TagsSection } from './TagsSection'

interface InspectorProps {
  nodes: NodeObj[]
  patch: (patch: NodePatch) => void
}

export function Inspector({ nodes, patch }: InspectorProps): React.ReactElement {
  const single = nodes.length === 1 ? nodes[0] : null

  return (
    <aside className="flex w-[268px] shrink-0 flex-col border-l border-shell-border bg-shell">
      <header className="flex h-[30px] shrink-0 items-center justify-between border-b border-shell-border px-3">
        <span className="text-[12px] font-semibold">节点样式</span>
        <span className="text-[11px] text-shell-muted">
          {nodes.length > 1 ? `已选中 ${nodes.length} 个` : ''}
        </span>
      </header>

      {nodes.length === 0 ? (
        <p className="px-3 py-6 text-center text-[12px] leading-relaxed text-shell-muted">
          选中一个节点后
          <br />
          即可调整它的外观
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <StyleSection nodes={nodes} patch={patch} />
          <BranchSection nodes={nodes} patch={patch} />
          {single ? (
            // Remounting on selection drops any half-typed tag or note into the void
            // rather than onto the node the user just moved to.
            <div key={single.id}>
              <TagsSection node={single} patch={patch} />
              <IconsSection node={single} patch={patch} />
              <ImageSection node={single} patch={patch} />
              <LinkNoteSection node={single} patch={patch} />
            </div>
          ) : (
            <p className="px-3 py-3 text-[11px] leading-snug text-shell-muted">
              标签、图标、图片、链接与备注仅在选中单个节点时可编辑。
            </p>
          )}
        </div>
      )}
    </aside>
  )
}
