interface TitleBarProps {
  title: string
  dirty: boolean
  filePath: string | null
  onNew: () => void
  onOpen: () => void
  onSave: () => void
}

function ToolbarButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="no-drag rounded-md px-2.5 py-1 text-[12px] text-shell-muted transition-colors hover:bg-shell-hover hover:text-shell-text"
    >
      {label}
    </button>
  )
}

export function TitleBar({
  title,
  dirty,
  filePath,
  onNew,
  onOpen,
  onSave,
}: TitleBarProps): React.ReactElement {
  return (
    <header className="drag-region flex h-[42px] shrink-0 select-none items-center border-b border-shell-border bg-shell pl-[88px] pr-2">
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="truncate text-[13px] font-semibold text-shell-text" title={filePath ?? ''}>
          {title}
        </span>
        {dirty && (
          <span className="text-[11px] text-shell-muted" aria-label="有未保存的更改">
            — 已编辑
          </span>
        )}
      </div>
      <nav className="flex items-center gap-0.5">
        <ToolbarButton label="新建" onClick={onNew} />
        <ToolbarButton label="打开" onClick={onOpen} />
        <ToolbarButton label="保存" onClick={onSave} />
      </nav>
    </header>
  )
}
