/**
 * End-to-end smoke test for the node style panel.
 *
 * Launches the built app with the DevTools protocol open, then drives the real renderer:
 * selects a node, restyles it through the inspector, and checks that the map, the dirty
 * flag, the undo stack, hand-panning, blank-click deselect, node drag
 * (including a gap wider than the built-in hit sliver, and a move to the other
 * side of the root), the original-image viewer and PNG capture
 * all react. Run with
 * `node scripts/smoke-inspector.mjs` after
 * `npm run build`; it exits non-zero on the first failed assertion.
 *
 * The app takes a single-instance lock, so no other MindFarm window may be open.
 */
import { spawn, spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 9333

// Electron degrades to a plain Node process when this is inherited from an editor terminal.
const env = { ...process.env }
delete env['ELECTRON_RUN_AS_NODE']

const electron = spawn(
  process.execPath,
  [resolve(root, 'node_modules/electron/cli.js'), '.', `--remote-debugging-port=${PORT}`],
  { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] },
)
electron.stderr.on('data', (chunk) => {
  const text = String(chunk)
  if (!/DevTools listening|task_name_for_pid|IMKClient|IMKInputSession/.test(text)) {
    process.stderr.write(text)
  }
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function dragMouse(cdp, from, to) {
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: from.x,
    y: from.y,
    button: 'left',
    clickCount: 1,
  })
  for (let step = 1; step <= 8; step++) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: from.x + ((to.x - from.x) * step) / 8,
      y: from.y + ((to.y - from.y) * step) / 8,
      button: 'left',
    })
  }
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: to.x,
    y: to.y,
    button: 'left',
    clickCount: 1,
  })
}

async function findPage() {
  let lastSeen = 'nothing'
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const targets = await res.json()
      lastSeen = JSON.stringify(targets.map((t) => ({ type: t.type, url: t.url })))
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch (error) {
      lastSeen = `fetch failed: ${error.message}`
    }
    await sleep(250)
  }
  throw new Error(`renderer target never appeared; last saw ${lastSeen}`)
}

function connect(url) {
  const ws = new WebSocket(url)
  const pending = new Map()
  let id = 0
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    const settle = pending.get(msg.id)
    if (settle) {
      pending.delete(msg.id)
      settle(msg)
    }
  })
  return {
    ready: new Promise((r) => ws.addEventListener('open', r)),
    close: () => ws.close(),
    async send(method, params = {}) {
      const messageId = ++id
      const reply = new Promise((r) => pending.set(messageId, r))
      ws.send(JSON.stringify({ id: messageId, method, params }))
      const msg = await reply
      if (msg.error) throw new Error(msg.error.message ?? JSON.stringify(msg.error))
      return msg.result
    },
    /** Runs `body` as a function body so each call gets its own scope. */
    async run(body) {
      const messageId = ++id
      const reply = new Promise((r) => pending.set(messageId, r))
      ws.send(
        JSON.stringify({
          id: messageId,
          method: 'Runtime.evaluate',
          params: {
            expression: `(async () => { ${body} })()`,
            awaitPromise: true,
            returnByValue: true,
          },
        }),
      )
      const msg = await reply
      if (msg.error) throw new Error(msg.error.message)
      const { result, exceptionDetails } = msg.result
      if (exceptionDetails) {
        throw new Error(exceptionDetails.exception?.description ?? 'evaluation threw')
      }
      return result.value
    },
  }
}

const failures = []
function check(label, ok, detail) {
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`,
  )
  if (!ok) failures.push(label)
}

const page = await findPage()
const cdp = connect(page.webSocketDebuggerUrl)
await cdp.ready

try {
  // The renderer needs a tick to mount the map and answer the inspector IPC call.
  await sleep(1500)

  await cdp.run(`
    window.__t = {
      panel: () => document.querySelector('aside'),
      // The root renders after its branches, so nodes are found by structure, not order.
      topics: () => [...document.querySelectorAll('me-tpc')],
      root: () => [...document.querySelectorAll('me-tpc')].find((t) => !t.nodeObj.parent),
      children: () => [...document.querySelectorAll('me-tpc')].filter((t) => t.nodeObj.parent),
      button: (label) =>
        [...document.querySelectorAll('aside button')].find((b) =>
          (b.title || b.textContent || '').includes(label),
        ),
      click: (el, modifiers = {}) => {
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
          el.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              button: 0,
              pointerId: 1,
              isPrimary: true,
              ...modifiers,
            }),
          )
        }
      },
      key: (init) =>
        document
          .querySelector('.mind-canvas')
          .firstElementChild.dispatchEvent(
            new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
          ),
      blankClick: () => {
        const map = document.querySelector('.map-container')
        for (const type of ['pointerdown', 'pointerup']) {
          map.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              button: 0,
              pointerId: 1,
              pointerType: 'mouse',
              isPrimary: true,
              clientX: 8,
              clientY: 8,
            }),
          )
        }
      },
    }
  `)

  check('inspector panel is visible', await cdp.run(`return !!window.__t.panel()`))
  check(
    'empty state shown before a selection',
    await cdp.run(`return window.__t.panel().textContent.includes('选中一个节点')`),
  )

  const nodeCount = await cdp.run(`return window.__t.topics().length`)
  check('map rendered nodes', nodeCount > 0, { nodeCount })

  // Default tool is the hand: dragging the blank canvas pans, and does not edit the document.
  const beforePan = await cdp.run(`return document.querySelector('.map-canvas').style.transform`)
  await cdp.run(`
    const map = document.querySelector('.map-container')
    const fire = (type, x, y) =>
      map.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          clientX: x,
          clientY: y,
        }),
      )
    fire('pointerdown', 200, 200)
    fire('pointermove', 280, 250)
    fire('pointerup', 280, 250)
    return null
  `)
  const afterPan = await cdp.run(`return document.querySelector('.map-canvas').style.transform`)
  check('hand drag pans the canvas', beforePan !== afterPan && afterPan.includes('translate'), {
    beforePan,
    afterPan,
  })
  check(
    'panning does not mark the document edited',
    !(await cdp.run(`return document.body.textContent.includes('已编辑')`)),
  )

  // The marquee tool gives the blank canvas back to mind-elixir, so the same drag stays put.
  await cdp.run(`
    ;[...document.querySelectorAll('footer button')].find((b) => b.textContent === '框选').click()
    return null
  `)
  const beforeSelect = await cdp.run(`return document.querySelector('.map-canvas').style.transform`)
  await cdp.run(`
    const map = document.querySelector('.map-container')
    const fire = (type, x, y) =>
      map.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          clientX: x,
          clientY: y,
        }),
      )
    fire('pointerdown', 200, 200)
    fire('pointermove', 40, 40)
    fire('pointerup', 40, 40)
    return null
  `)
  check(
    'marquee mode leaves the canvas where it is',
    (await cdp.run(`return document.querySelector('.map-canvas').style.transform`)) === beforeSelect,
  )
  await cdp.run(`
    ;[...document.querySelectorAll('footer button')].find((b) => b.textContent === '手形').click()
    return null
  `)

  // Select the root the way a user would: a pointer event on the topic element.
  await cdp.run(`window.__t.click(window.__t.root()); return null`)
  await sleep(300)

  check(
    'selecting a node reveals the style sections',
    await cdp.run(`return window.__t.panel().textContent.includes('文本')`),
  )
  check(
    'image section is available for one node',
    await cdp.run(`return window.__t.panel().textContent.includes('图片')`),
  )

  // A click on blank canvas in marquee mode dismisses the node without panning.
  await cdp.run(`
    ;[...document.querySelectorAll('footer button')].find((b) => b.textContent === '框选').click()
    return null
  `)
  const beforeBlank = await cdp.run(`return document.querySelector('.map-canvas').style.transform`)
  await cdp.run(`window.__t.blankClick(); return null`)
  await sleep(200)
  check(
    'blank click in marquee mode clears the selection',
    await cdp.run(`return !document.querySelector('.selected') && !document.getElementById('input-box')`),
  )
  check(
    'blank click in marquee mode does not pan',
    (await cdp.run(`return document.querySelector('.map-canvas').style.transform`)) === beforeBlank,
  )
  await cdp.run(`
    ;[...document.querySelectorAll('footer button')].find((b) => b.textContent === '手形').click()
    window.__t.click(window.__t.root())
    return null
  `)
  await sleep(200)

  const beforeColor = await cdp.run(`return window.__t.root().style.color`)
  await cdp.run(`window.__t.button('#ff453a').click(); return null`)
  await sleep(300)

  const afterColor = await cdp.run(`return window.__t.root().style.color`)
  check('swatch recolours the node', afterColor === 'rgb(255, 69, 58)', { beforeColor, afterColor })
  check(
    'colour lands on the document model',
    (await cdp.run(`return window.__t.root().nodeObj.style?.color`)) === '#ff453a',
  )
  check('document is marked edited', await cdp.run(`return document.body.textContent.includes('已编辑')`))

  // mind-elixir binds Cmd+Z on its own container, which is where the native menu routes too.
  await cdp.run(`window.__t.key({ key: 'z', metaKey: true }); return null`)
  await sleep(500)

  const undoneColor = await cdp.run(`return window.__t.root().style.color`)
  check('undo restores the original colour', undoneColor === beforeColor, { undoneColor })

  // Notes have no representation in mind-elixir, so the indicator is ours to maintain.
  await cdp.run(`window.__t.click(window.__t.root()); return null`)
  await sleep(300)
  await cdp.run(`
    const area = document.querySelector('aside textarea')
    area.focus()
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(area, '一些备注')
    area.dispatchEvent(new Event('input', { bubbles: true }))
    window.__t.blankClick()
    return null
  `)
  await sleep(500)

  check(
    'note is stored on the node',
    (await cdp.run(`return window.__t.root().nodeObj.note`)) === '一些备注',
  )
  check(
    'note indicator attribute is applied',
    await cdp.run(`return window.__t.root().hasAttribute('data-note')`),
  )
  check(
    'blank click clears the selection after committing the note',
    await cdp.run(`return !document.querySelector('.selected') && !document.getElementById('input-box')`),
  )
  check(
    'blank click returns the panel to its empty state',
    await cdp.run(`return window.__t.panel().textContent.includes('选中一个节点')`),
  )

  // Double-click opens the topic editor; a blank click must close it and drop the selection.
  // The two clicks have to land in different milliseconds or mind-elixir ignores the pair.
  await cdp.run(`window.__t.click(window.__t.root()); return null`)
  await sleep(40)
  check(
    'double-click starts editing the node',
    await cdp.run(`
      window.__t.click(window.__t.root())
      return !!document.getElementById('input-box')
    `),
  )
  await cdp.run(`window.__t.blankClick(); return null`)
  await sleep(200)
  check(
    'blank click ends editing',
    await cdp.run(`return !document.getElementById('input-box') && !document.querySelector('.selected')`),
  )

  // A fresh map is just a root, so grow two siblings to exercise the multi-selection path.
  for (let i = 0; i < 2; i++) {
    await cdp.run(`window.__t.click(window.__t.root()); return null`)
    await sleep(150)
    await cdp.run(`window.__t.key({ key: 'Tab' }); return null`)
    await sleep(300)
  }
  const grown = await cdp.run(`return window.__t.topics().length`)
  check('children were added for the multi-selection case', grown >= 3, { topics: grown })

  if (grown >= 3) {
    await cdp.run(`document.getElementById('input-box')?.blur(); return null`)
    await sleep(200)
    const drag = await cdp.run(`
      const [target, dragged] = window.__t.children()
      const tr = target.getBoundingClientRect()
      const dr = dragged.getBoundingClientRect()
      return {
        dragged: dragged.nodeObj.id,
        target: target.nodeObj.id,
        before: target.nodeObj.parent.children.map((n) => n.id),
        from: { x: dr.x + dr.width / 2, y: dr.y + dr.height / 2 },
        to: { x: tr.x + tr.width / 2, y: Math.max(1, tr.y - 6) },
      }
    `)
    await dragMouse(cdp, drag.from, drag.to)
    await sleep(400)
    const afterDrag = await cdp.run(`
      const id = ${JSON.stringify(drag.target)}
      const topic = window.__t.topics().find((t) => t.nodeObj.id === id)
      return topic.nodeObj.parent.children.map((n) => n.id)
    `)
    check(
      'dragging a node places it before its sibling',
      afterDrag.indexOf(drag.dragged) === afterDrag.indexOf(drag.target) - 1,
      { before: drag.before, after: afterDrag },
    )
    check(
      'dragging marks the document edited',
      await cdp.run(`return document.body.textContent.includes('已编辑')`),
    )
    await cdp.run(`window.__t.key({ key: 'z', metaKey: true }); return null`)
    await sleep(400)
    const restored = await cdp.run(`return window.__t.root().nodeObj.children.map((n) => n.id)`)
    check('undo restores sibling order', JSON.stringify(restored) === JSON.stringify(drag.before), {
      restored,
      before: drag.before,
    })

    // Four more branches make three on the right. The gap between them is the
    // margin, far outside the 12px band the built-in drag used to require.
    for (let i = 0; i < 4; i++) {
      await cdp.run(`window.__t.click(window.__t.root()); return null`)
      await sleep(150)
      await cdp.run(`window.__t.key({ key: 'Tab' }); return null`)
      await sleep(300)
    }
    await cdp.run(`document.getElementById('input-box')?.blur(); return null`)
    await sleep(200)
    const reorder = await cdp.run(`
      const right = [...document.querySelectorAll('.rhs > me-wrapper > me-parent > me-tpc')]
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      const upper = right[0]
      const middle = right[1]
      const lower = right[right.length - 1]
      const ur = upper.getBoundingClientRect()
      const mr = middle.getBoundingClientRect()
      const lr = lower.getBoundingClientRect()
      return {
        count: right.length,
        upper: upper.nodeObj.id,
        lower: lower.nodeObj.id,
        gap: mr.top - ur.bottom,
        from: { x: lr.x + lr.width / 2, y: lr.y + lr.height / 2 },
        to: { x: ur.x + ur.width / 2, y: (ur.bottom + mr.top) / 2 },
      }
    `)
    check('right side has three branches to reorder', reorder.count >= 3 && reorder.gap > 24, reorder)
    await dragMouse(cdp, reorder.from, reorder.to)
    await sleep(400)
    const reordered = await cdp.run(`
      return [...document.querySelectorAll('.rhs > me-wrapper > me-parent > me-tpc')]
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
        .map((t) => t.nodeObj.id)
    `)
    check(
      'dropping in the gap reorders that side',
      reordered[0] === reorder.upper && reordered[1] === reorder.lower,
      { reordered, reorder },
    )
    await cdp.run(`window.__t.key({ key: 'z', metaKey: true }); return null`)
    await sleep(400)

    const cross = await cdp.run(`
      const right = [...document.querySelectorAll('.rhs > me-wrapper > me-parent > me-tpc')]
      const node = right[0]
      const nr = node.getBoundingClientRect()
      const root = window.__t.root().getBoundingClientRect()
      return {
        id: node.nodeObj.id,
        from: { x: nr.x + nr.width / 2, y: nr.y + nr.height / 2 },
        to: { x: root.x - 40, y: root.y + root.height / 2 },
      }
    `)
    await dragMouse(cdp, cross.from, cross.to)
    await sleep(400)
    const moved = await cdp.run(`
      const id = ${JSON.stringify(cross.id)}
      const topic = window.__t.topics().find((t) => t.nodeObj.id === id)
      return {
        direction: topic.nodeObj.direction,
        rootChild: !topic.nodeObj.parent.parent,
        side: topic.closest('.lhs') ? 'left' : topic.closest('.rhs') ? 'right' : 'other',
      }
    `)
    check(
      'dropping left of the root moves the branch to the left',
      moved.direction === 0 && moved.rootChild && moved.side === 'left',
      moved,
    )
    await cdp.run(`window.__t.key({ key: 'z', metaKey: true }); return null`)
    await sleep(400)
    const backRight = await cdp.run(`
      const id = ${JSON.stringify(cross.id)}
      const topic = window.__t.topics().find((t) => t.nodeObj.id === id)
      return topic.closest('.rhs') ? topic.nodeObj.direction : -1
    `)
    check('undo puts the branch back on the right', backRight === 1, { backRight })
    for (let i = 0; i < 4; i++) {
      await cdp.run(`window.__t.key({ key: 'z', metaKey: true }); return null`)
      await sleep(200)
    }
    const branchCount = await cdp.run(`return window.__t.root().nodeObj.children.length`)
    check('extra branches were undone', branchCount === 2, { branchCount })

    // Cmd-click extends the selection, the same gesture the user makes.
    await cdp.run(`
      const [first, second] = window.__t.children()
      window.__t.click(first)
      window.__t.click(second, { metaKey: true })
      return null
    `)
    await sleep(300)
    check(
      'panel reports a multi-selection',
      await cdp.run(`return window.__t.panel().textContent.includes('已选中 2 个')`),
    )

    await cdp.run(`window.__t.button('#34c759').click(); return null`)
    await sleep(400)
    check(
      'both selected nodes take the colour',
      await cdp.run(`
        return window.__t.children().every((t) => t.nodeObj.style?.color === '#34c759')
      `),
    )
    check(
      'siblings keep separate style objects',
      await cdp.run(`
        const [first, second] = window.__t.children()
        return first.nodeObj.style !== second.nodeObj.style
      `),
    )

    // The root carries a note; a shared patch object would have copied it onto the children.
    check(
      'multi-select patch did not leak the root note',
      await cdp.run(`return window.__t.children().every((t) => !t.nodeObj.note)`),
    )
    check(
      'unselected root is left untouched',
      (await cdp.run(`return window.__t.root().nodeObj.style?.color`)) === undefined,
    )

    // Deleting moves the selection to the parent; the panel must not keep showing a
    // node that no longer exists.
    await cdp.run(`window.__t.click(window.__t.children()[0]); return null`)
    await sleep(200)
    await cdp.run(`window.__t.key({ key: 'Delete' }); return null`)
    await sleep(400)
    check(
      'deleting a node hands the panel its parent',
      await cdp.run(`return window.__t.panel().textContent.includes('一些备注')`),
    )
  }

  await cdp.run(`window.__t.click(window.__t.root()); return null`)
  await sleep(200)
  const image = await cdp.run(`
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 4
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(0, 0, 8, 4)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    await window.__mindfarmApplyImage(bytes)
    const root = window.__t.root()
    return {
      img: !!root.querySelector('img'),
      dataUrl: root.nodeObj.image?.url?.startsWith('data:') === true,
      width: root.nodeObj.image?.width,
      height: root.nodeObj.image?.height,
    }
  `)
  check('image is painted on the node', image.img && image.dataUrl && image.width === 8 && image.height === 4, image)
  await sleep(200)
  const original = await cdp.run(`
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#0000ff'
    ctx.fillRect(0, 0, 2, 2)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    await window.__mindfarmAttachOriginal(bytes, 'image/png')
    const root = window.__t.root()
    const img = root.querySelector('img')
    const rect = img.getBoundingClientRect()
    for (const type of ['pointerdown', 'pointerup']) {
      img.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          clientX: rect.x + rect.width / 2,
          clientY: rect.y + rect.height / 2,
        }),
      )
    }
    let viewer = null
    for (let i = 0; i < 20 && !viewer; i++) {
      viewer = document.querySelector('[data-original-viewer] img')
      if (!viewer) await new Promise((resolve) => setTimeout(resolve, 50))
    }
    if (viewer && !viewer.complete) {
      await new Promise((resolve) => {
        viewer.onload = resolve
        viewer.onerror = resolve
      })
    }
    return {
      thumbWidth: root.nodeObj.image?.width,
      originalName: root.nodeObj.image?.original ?? '',
      viewerWidth: viewer?.naturalWidth ?? 0,
      viewerHeight: viewer?.naturalHeight ?? 0,
      blob: viewer?.src.startsWith('blob:') === true,
    }
  `)
  check(
    'clicking the thumbnail opens the original',
    original.thumbWidth === 8 &&
      /^[0-9a-f-]{36}\.png$/i.test(original.originalName) &&
      original.viewerWidth === 2 &&
      original.viewerHeight === 2 &&
      original.blob,
    original,
  )
  await cdp.run(`document.querySelector('[data-original-viewer]')?.click(); return null`)
  await sleep(100)
  await cdp.run(`window.__t.button('移除图片').click(); return null`)
  await sleep(300)
  check(
    'removing the image clears the node',
    await cdp.run(`return !window.__t.root().querySelector('img') && !window.__t.root().nodeObj.image`),
  )

  const png = await cdp.run(`
    const bytes = await window.__mindfarmCapture()
    return {
      length: bytes.byteLength,
      png: bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71,
    }
  `)
  check('png capture is a real image', png.png && png.length > 1000, png)
} finally {
  cdp.close()
  // The Electron binary is a child of the CLI and survives a signal to the parent.
  spawnSync('pkill', ['-KILL', '-P', String(electron.pid)])
  electron.kill('SIGKILL')
}

console.log(failures.length === 0 ? '\nall checks passed' : `\nfailed: ${failures.join(', ')}`)
process.exit(failures.length === 0 ? 0 : 1)
