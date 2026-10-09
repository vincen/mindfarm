import type { CanvasTool } from '@renderer/hooks/useHandTool'

interface StatusBarProps {
  filePath: string | null
  selectionCount: number
  scale: number
  tool: CanvasTool
  onTool: (tool: CanvasTool) => void
  onZoomOut: () => void
  onZoomReset: () => void
  onZoomIn: () => void
  onFit: () => void
  onCenter: () => void
}

function StatusButton({
  label,
  title,
  active = false,
  onClick,
}: {
  label: string
  title: string
  active?: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={`rounded px-2 py-0.5 transition-colors hover:bg-shell-hover hover:text-shell-text ${
        active ? 'bg-shell-hover text-shell-text' : 'text-shell-muted'
      }`}
    >
      {label}
    </button>
  )
}

export function StatusBar({
  filePath,
  selectionCount,
  scale,
  tool,
  onTool,
  onZoomOut,
  onZoomReset,
  onZoomIn,
  onFit,
  onCenter,
}: StatusBarProps): React.ReactElement {
  return (
    <footer className="flex h-[26px] shrink-0 select-none items-center justify-between border-t border-shell-border bg-shell px-2 text-[11px] text-shell-muted">
      <span className="truncate" title={filePath ?? ''}>
        {filePath ?? '尚未保存到文件'}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        {selectionCount > 0 && <span className="mr-2">已选中 {selectionCount} 个节点</span>}
        <StatusButton
          label="手形"
          title="手形平移 (H)"
          active={tool === 'hand'}
          onClick={() => onTool('hand')}
        />
        <StatusButton
          label="框选"
          title="框选节点 (V)"
          active={tool === 'select'}
          onClick={() => onTool('select')}
        />
        <StatusButton label="缩小" title="缩小 (⌘-)" onClick={onZoomOut} />
        <button
          type="button"
          title="实际大小 (⌘0)"
          onClick={onZoomReset}
          className="w-12 rounded px-1 py-0.5 tabular-nums text-shell-text transition-colors hover:bg-shell-hover"
        >
          {Math.round(scale * 100)}%
        </button>
        <StatusButton label="放大" title="放大 (⌘=)" onClick={onZoomIn} />
        <StatusButton label="适应" title="适应窗口 (⇧⌘0)" onClick={onFit} />
        <StatusButton label="居中" title="回到中心" onClick={onCenter} />
      </div>
    </footer>
  )
}
