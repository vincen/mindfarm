import { ColorField } from './ColorField'
import { Row, Section, ToggleButton } from './fields'
import { sharedValue, type SectionProps } from './shared'

const FONT_SIZES = [
  { label: '默认', value: '' },
  { label: '12', value: '12px' },
  { label: '14', value: '14px' },
  { label: '16', value: '16px' },
  { label: '20', value: '20px' },
  { label: '24', value: '24px' },
  { label: '32', value: '32px' },
]

export function StyleSection({ nodes, patch }: SectionProps): React.ReactElement {
  const fontSize = sharedValue(nodes, (node) => node.style?.fontSize)
  const color = sharedValue(nodes, (node) => node.style?.color)
  const background = sharedValue(nodes, (node) => node.style?.background)
  const bold = sharedValue(nodes, (node) => node.style?.fontWeight) === '700'
  const strike = sharedValue(nodes, (node) => node.style?.textDecoration) === 'line-through'

  return (
    <Section title="文本">
      <Row label="字号">
        <select
          value={fontSize}
          onChange={(event) => patch({ style: { fontSize: event.target.value } })}
          className="h-6 rounded border border-shell-border bg-transparent px-1 text-[12px] text-shell-text"
        >
          {FONT_SIZES.map((size) => (
            <option key={size.value} value={size.value}>
              {size.label}
            </option>
          ))}
        </select>
        <ToggleButton
          label="B"
          title="粗体"
          active={bold}
          onClick={() => patch({ style: { fontWeight: bold ? '' : '700' } })}
        />
        <ToggleButton
          label="S"
          title="删除线"
          active={strike}
          onClick={() => patch({ style: { textDecoration: strike ? '' : 'line-through' } })}
        />
      </Row>
      <ColorField
        label="文字"
        value={color}
        fallback="#1c1c1e"
        onChange={(next) => patch({ style: { color: next } })}
      />
      <ColorField
        label="背景"
        value={background}
        fallback="#ffffff"
        onChange={(next) => patch({ style: { background: next } })}
      />
    </Section>
  )
}
