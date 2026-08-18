/**
 * Turns the flat source artwork in `build/` into the `.icns` bundles electron-builder
 * needs. The source renders sit on an opaque backdrop, so the backdrop is flood-filled
 * to transparent from the borders before macOS' `sips` / `iconutil` do the resizing.
 */
import { deflateSync, inflateSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = join(root, 'build')

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const ICON_SIZES = [16, 32, 128, 256, 512]

const crcTable = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

function unfilter(type, cur, prev, bpp) {
  const n = cur.length
  switch (type) {
    case 0:
      break
    case 1:
      for (let i = bpp; i < n; i++) cur[i] = (cur[i] + cur[i - bpp]) & 255
      break
    case 2:
      for (let i = 0; i < n; i++) cur[i] = (cur[i] + prev[i]) & 255
      break
    case 3:
      for (let i = 0; i < n; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0
        cur[i] = (cur[i] + ((a + prev[i]) >> 1)) & 255
      }
      break
    case 4:
      for (let i = 0; i < n; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0
        const c = i >= bpp ? prev[i - bpp] : 0
        cur[i] = (cur[i] + paeth(a, prev[i], c)) & 255
      }
      break
    default:
      throw new Error(`unsupported PNG filter ${type}`)
  }
}

function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG file')

  let width = 0
  let height = 0
  let channels = 0
  const idat = []

  for (let pos = 8; pos < buffer.length; ) {
    const length = buffer.readUInt32BE(pos)
    const type = buffer.toString('ascii', pos + 4, pos + 8)
    const data = buffer.subarray(pos + 8, pos + 8 + length)

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      if (data[8] !== 8) throw new Error('only 8-bit PNGs are supported')
      if (data[12] !== 0) throw new Error('interlaced PNGs are not supported')
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0
      if (!channels) throw new Error(`unsupported PNG color type ${data[9]}`)
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    pos += 12 + length
  }

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const rgba = Buffer.alloc(width * height * 4)
  let prev = Buffer.alloc(stride)
  let offset = 0

  for (let y = 0; y < height; y++) {
    const filter = raw[offset++]
    const line = Buffer.from(raw.subarray(offset, offset + stride))
    offset += stride
    unfilter(filter, line, prev, channels)
    for (let x = 0; x < width; x++) {
      const s = x * channels
      const d = (y * width + x) * 4
      rgba[d] = line[s]
      rgba[d + 1] = line[s + 1]
      rgba[d + 2] = line[s + 2]
      rgba[d + 3] = channels === 4 ? line[s + 3] : 255
    }
    prev = line
  }

  return { width, height, rgba }
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}

function encodePng({ width, height, rgba }) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Clears the opaque backdrop, feathering the boundary so downscaled icons stay smooth. */
function removeBackdrop(image, tolerance) {
  const { width, height, rgba } = image
  const [br, bg, bb] = [rgba[0], rgba[1], rgba[2]]
  const distance = (i) =>
    Math.max(Math.abs(rgba[i] - br), Math.abs(rgba[i + 1] - bg), Math.abs(rgba[i + 2] - bb))

  const background = new Uint8Array(width * height)
  const stack = []
  for (let x = 0; x < width; x++) {
    stack.push(x, (height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    stack.push(y * width, y * width + width - 1)
  }

  while (stack.length > 0) {
    const p = stack.pop()
    if (background[p]) continue
    if (distance(p * 4) > tolerance) continue
    background[p] = 1
    const x = p % width
    const y = (p - x) / width
    if (x > 0) stack.push(p - 1)
    if (x < width - 1) stack.push(p + 1)
    if (y > 0) stack.push(p - width)
    if (y < height - 1) stack.push(p + width)
  }

  let cleared = 0
  for (let p = 0; p < background.length; p++) {
    if (background[p]) {
      rgba[p * 4 + 3] = 0
      cleared++
      continue
    }
    const x = p % width
    const y = (p - x) / width
    const touchesBackdrop =
      (x > 0 && background[p - 1]) ||
      (x < width - 1 && background[p + 1]) ||
      (y > 0 && background[p - width]) ||
      (y < height - 1 && background[p + width])
    if (touchesBackdrop) {
      rgba[p * 4 + 3] = Math.min(255, distance(p * 4) * 6)
    }
  }

  return cleared / background.length
}

function buildIcns(name, sourceFile, tolerance) {
  const image = decodePng(readFileSync(join(buildDir, sourceFile)))
  const transparentRatio = removeBackdrop(image, tolerance)

  const center = ((image.height / 2) * image.width + image.width / 2) * 4
  if (image.rgba[center + 3] === 0) throw new Error(`${name}: flood fill leaked into the artwork`)

  const flatPng = join(buildDir, `${name}-flat.png`)
  writeFileSync(flatPng, encodePng(image))

  const iconset = join(buildDir, `${name}.iconset`)
  rmSync(iconset, { recursive: true, force: true })
  mkdirSync(iconset, { recursive: true })

  for (const size of ICON_SIZES) {
    for (const scale of [1, 2]) {
      const pixels = size * scale
      const suffix = scale === 2 ? '@2x' : ''
      execFileSync('sips', [
        '-z',
        String(pixels),
        String(pixels),
        flatPng,
        '--out',
        join(iconset, `icon_${size}x${size}${suffix}.png`),
      ])
    }
  }

  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(buildDir, `${name}.icns`)])
  rmSync(iconset, { recursive: true, force: true })
  rmSync(flatPng, { force: true })

  console.log(`${name}.icns  (backdrop removed: ${(transparentRatio * 100).toFixed(1)}%)`)
}

buildIcns('icon', 'icon-source.png', 40)
buildIcns('document', 'document-source.png', 14)
