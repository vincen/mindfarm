/**
 * End-to-end smoke test for the node style panel.
 *
 * Launches the built app with the DevTools protocol open, then drives the real renderer:
 * selects a node, restyles it through the inspector, and checks that the map, the dirty
 * flag, the undo stack, hand-panning and PNG capture all react. Run with
 * `node scripts/smoke-inspector.mjs` after
 * `npm run build`; it exits non-zero on the first failed assertion.
 *
 * The app takes a single-instance lock, so no other MindFarm window may be open.
 */
import { spawn } from 'node:child_process'
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
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(area, '一些备注')
    area.dispatchEvent(new Event('input', { bubbles: true }))
    area.dispatchEvent(new FocusEvent('blur'))
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
  electron.kill()
}

console.log(failures.length === 0 ? '\nall checks passed' : `\nfailed: ${failures.join(', ')}`)
process.exit(failures.length === 0 ? 0 : 1)
