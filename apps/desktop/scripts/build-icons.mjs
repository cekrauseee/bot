import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(root, 'assets/icon.svg')
const outputRoot = path.join(root, 'assets/generated')
const source = await readFile(sourcePath)

await mkdir(outputRoot, { recursive: true })
await copyFile(sourcePath, path.join(outputRoot, 'icon.svg'))
await copyFile(sourcePath, path.resolve(root, '../web/public/favicon.svg'))

async function png(size) {
  return sharp(source, { density: 1024 })
    .resize(size, size, { fit: 'contain' })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer()
}

const iconPng = await png(512)
await writeFile(path.join(outputRoot, 'icon.png'), iconPng)

// PNG-backed ICO with deterministic entries for the common shell sizes.
const icoSizes = [16, 32, 48, 64, 128, 256]
const icoImages = await Promise.all(icoSizes.map(png))
const icoHeader = Buffer.alloc(6 + icoSizes.length * 16)
icoHeader.writeUInt16LE(0, 0)
icoHeader.writeUInt16LE(1, 2)
icoHeader.writeUInt16LE(icoSizes.length, 4)
let offset = icoHeader.length
for (let index = 0; index < icoSizes.length; index += 1) {
  const size = icoSizes[index]
  const entry = 6 + index * 16
  icoHeader.writeUInt8(size === 256 ? 0 : size, entry)
  icoHeader.writeUInt8(size === 256 ? 0 : size, entry + 1)
  icoHeader.writeUInt8(0, entry + 2)
  icoHeader.writeUInt8(0, entry + 3)
  icoHeader.writeUInt16LE(1, entry + 4)
  icoHeader.writeUInt16LE(32, entry + 6)
  icoHeader.writeUInt32LE(icoImages[index].length, entry + 8)
  icoHeader.writeUInt32LE(offset, entry + 12)
  offset += icoImages[index].length
}
await writeFile(path.join(root, 'assets/icon.ico'), Buffer.concat([icoHeader, ...icoImages]))

const iconset = path.join(outputRoot, 'icon.iconset')
await mkdir(iconset, { recursive: true })
for (const size of [16, 32, 128, 256, 512]) {
  await writeFile(path.join(iconset, `icon_${size}x${size}.png`), await png(size))
  await writeFile(path.join(iconset, `icon_${size}x${size}@2x.png`), await png(size * 2))
}

try {
  const { execFileSync } = await import('node:child_process')
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(root, 'assets/icon.icns')], { stdio: 'ignore' })
} catch {
  // iconutil is macOS-only; the complete iconset remains available for the
  // macOS packaging host to assemble into ICNS.
}
console.log('Generated deterministic icons from assets/icon.svg')
