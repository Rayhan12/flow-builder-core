#!/usr/bin/env node
/**
 * Renders public favicon / app icons from the brand mark SVG via sharp.
 * Usage: npm run brand:icons
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const markPath = path.join(root, 'src/assets/brand/mark.svg')
const publicDir = path.join(root, 'public')

const PNG_SIZES = [
  { file: 'favicon-16.png', size: 16 },
  { file: 'favicon-32.png', size: 32 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'icon-512.png', size: 512 },
]

async function main() {
  await mkdir(publicDir, { recursive: true })
  const svg = await readFile(markPath)

  // Favicon SVG: padded mark on a square canvas for crisp browser tabs.
  const faviconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect width="32" height="32" rx="6" fill="#f0fdfa"/>
  <rect x="3" y="3" width="10" height="10" rx="2.5" fill="#0f766e"/>
  <rect x="19" y="3" width="10" height="10" rx="2.5" fill="#0d9488"/>
  <rect x="3" y="19" width="10" height="10" rx="2.5" fill="#0f766e"/>
  <path d="M13 8h6M8 13v6" stroke="#0f766e" stroke-width="2.5" stroke-linecap="square"/>
</svg>
`
  await writeFile(path.join(publicDir, 'favicon.svg'), faviconSvg)

  for (const { file, size } of PNG_SIZES) {
    const padded =
      size >= 180
        ? Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect width="32" height="32" rx="6" fill="#f0fdfa"/>
  <rect x="3" y="3" width="10" height="10" rx="2.5" fill="#0f766e"/>
  <rect x="19" y="3" width="10" height="10" rx="2.5" fill="#0d9488"/>
  <rect x="3" y="19" width="10" height="10" rx="2.5" fill="#0f766e"/>
  <path d="M13 8h6M8 13v6" stroke="#0f766e" stroke-width="2.5" stroke-linecap="square"/>
</svg>
`)
        : svg

    await sharp(padded)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(publicDir, file))
    console.log(`wrote public/${file}`)
  }

  console.log('wrote public/favicon.svg')
  console.log('brand icons ready')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
