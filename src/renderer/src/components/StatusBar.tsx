interface StatusBarProps {
  filePath: string | null
  selectionCount: number
  scale: number
  onZoomOut: () => void
  onZoomReset: () => void
  onZoomIn: () => void
  onFit: () => void
  onCenter: () => void
}

function StatusButton({
  label,
  title,
  onClick,
}: {
  label: string
  title: string
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded px-2 py-0.5 text-shell-muted transition-colors hover:bg-shell-hover hover:text-shell-text"
    >
      {label}
    </button>
  )
}

export function StatusBar({
  filePath,
  selectionCount,
  scale,
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
