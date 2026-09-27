/*
  Author: Runor Ewhro
  Description: Renders the overview build card as a PNG for downloads and the
               system clipboard without adding capture code to the main bundle.
*/

import { rasterizeCard } from './captureRaster'
import { waitForFontStylesheets } from '@/application/theme/typography'
import { resolveImageRef } from '@/application/media/imageUpload'

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('font read failed'))
    reader.readAsDataURL(blob)
  })
}

// Inline reachable font assets so the exported image is self-contained.
export function resolveFontAssetUrl(url: string, stylesheetHref: string | null, documentBase: string): string {
  return new URL(url, stylesheetHref || documentBase).href
}

type FontUsage = Map<string, Set<string>>
function recordFonts(usage: FontUsage, style: CSSStyleDeclaration) {
  for (const raw of (style.fontFamily ?? '').split(',')) {
    const family = raw.trim().replace(/^['"]|['"]$/g, '').toLowerCase()
    let variants = usage.get(family)
    if (!variants) usage.set(family, variants = new Set())
    variants.add(`${style.fontStyle}:${style.fontWeight}`)
  }
}

export function fontFaceUsed(css: string, usage: FontUsage, text: string): boolean {
  const family = /font-family:\s*([^;]+)/i.exec(css)?.[1].trim().replace(/^['"]|['"]$/g, '').toLowerCase()
  if (!family || !usage.has(family)) return false
  const range = /unicode-range:\s*([^;}]+)/i.exec(css)?.[1]
  if (range) {
    const ranges = range.split(',').map((entry) => {
      const token = entry.trim().replace(/^U\+/i, '')
      const [first, last] = token.split('-')
      return [parseInt(first.replace(/\?/g, '0'), 16), parseInt((last ?? first).replace(/\?/g, 'f'), 16)]
    })
    if (![...text].some((char) => ranges.some(([min, max]) => char.codePointAt(0)! >= min && char.codePointAt(0)! <= max))) return false
  }
  // Keep all declared weights of a used family: browser font matching may select
  // a nearby weight or synthesize bold/italic when an exact face is absent.
  return true
}

function makeCaptureResources() {
  const pending = new Map<string, Promise<string>>()
  return {
    load(url: string): Promise<string> {
      const absolute = new URL(url, document.baseURI).href
      if (absolute.startsWith('data:')) return Promise.resolve(absolute)
      let value = pending.get(absolute)
      if (!value) {
        value = (async () => {
          const image = await resolveImageRef(url)
          if (!image) throw new Error('Capture artwork is unavailable.')
          try {
            const response = await fetch(image.url)
            if (!response.ok) throw new Error(`Capture asset could not be loaded: ${response.status}`)
            return await blobToDataUrl(await response.blob())
          } finally { image.revoke?.() }
        })()
        pending.set(absolute, value)
      }
      return value
    },
    dispose() { pending.clear() },
  }
}

export async function embedCaptureUrls(css: string, load: (url: string) => Promise<string>, base = document.baseURI): Promise<string> {
  const pattern = /url\(["']?([^)"']+)["']?\)/g
  const replacements = new Map<string, string>()
  for (const match of css.matchAll(pattern)) {
    const url = match[1]
    if (replacements.has(url) || url.startsWith('data:') || url.startsWith('#')) continue
    const absolute = new URL(url, base).href
    const embedded = absolute.split('#')[0] === document.baseURI.split('#')[0] && absolute.includes('#')
      ? '#' + absolute.split('#')[1] : await load(absolute)
    replacements.set(url, `url("${embedded}")`)
  }
  // Replace complete URL tokens. A relative URL may also be a substring of a
  // computed absolute URL on the same node; replacing substrings corrupts both.
  return css.replace(pattern, (token, url: string) => replacements.get(url) ?? token)
}

async function buildFontEmbedCss(usage: FontUsage, text: string, load: (url: string) => Promise<string>): Promise<string> {
  const visited = new Set<string>()
  const blocks: string[] = []
  const add = async (css: string, base: string) => {
    for (const match of css.matchAll(/@font-face\s*\{[^}]*\}/gi)) {
      if (fontFaceUsed(match[0], usage, text)) blocks.push(await embedCaptureUrls(match[0], load, base))
    }
  }
  const visit = async (sheet: CSSStyleSheet) => {
    if (sheet.href && visited.has(sheet.href)) return
    if (sheet.href) visited.add(sheet.href)
    const rules = async (entries: CSSRuleList) => {
      for (const rule of Array.from(entries)) {
        if (rule instanceof CSSImportRule && rule.styleSheet) await visit(rule.styleSheet)
        else if (rule instanceof CSSFontFaceRule) await add(rule.cssText, sheet.href || document.baseURI)
        else if ('cssRules' in rule) await rules((rule as CSSGroupingRule).cssRules)
      }
    }
    try {
      await rules(sheet.cssRules)
    } catch {
      if (sheet.href) {
        try { await add(await (await fetch(sheet.href)).text(), sheet.href) } catch { /* Match browser font fallback if unavailable. */ }
      }
    }
  }
  for (const sheet of Array.from(document.styleSheets)) await visit(sheet)
  return blocks.join('\n')
}

// Freeze the live composition on a disposable clone. Only the host is moved
// offscreen: moving the card itself would put its contents outside the PNG.
function createCaptureClone(source: HTMLElement): { card: HTMLElement; fonts: FontUsage; text: string; dispose: () => void } {
  const fonts: FontUsage = new Map()
  let text = source.textContent || ''
  const pseudos: string[] = []
  const card = source.cloneNode(true) as HTMLElement
  const originals = [source, ...source.querySelectorAll<HTMLElement | SVGElement>('*')]
  const copies = [card, ...card.querySelectorAll<HTMLElement | SVGElement>('*')]
  for (let index = 0; index < originals.length; index += 1) {
    const original = originals[index]
    const copy = copies[index]
    if (!copy.style) continue
    const computed = getComputedStyle(original)
    recordFonts(fonts, computed)
    // Computed declarations already resolve custom properties. Do not retain
    // another copy of the original variable payload on every captured element.
    copy.style.cssText = ''
    copy.setAttribute('data-capture-node', String(index))
    for (const pseudo of ['::before', '::after']) {
      const style = getComputedStyle(original, pseudo)
      if (!style.content || style.content === 'none' || style.content === 'normal') continue
      recordFonts(fonts, style)
      text += style.content
      const declarations = Array.from(style).filter((key) => !key.startsWith('--')).map((key) => `${key}:${style.getPropertyValue(key)};`).join('')
      pseudos.push(`[data-capture-node="${index}"]${pseudo}{${declarations}animation:none!important;transition:none!important;}`)
    }
    for (const property of Array.from(computed)) {
      if (property.startsWith('--')) continue
      copy.style.setProperty(property, computed.getPropertyValue(property))
    }
    copy.style.setProperty('animation', 'none', 'important')
    copy.style.setProperty('transition', 'none', 'important')
    if (original instanceof HTMLImageElement && copy instanceof HTMLImageElement) {
      copy.src = original.currentSrc || original.src
      copy.removeAttribute('srcset')
      copy.removeAttribute('sizes')
      copy.loading = 'eager'
    }
    if (original instanceof HTMLCanvasElement && copy instanceof HTMLCanvasElement
      && !original.classList.contains('spine-animated')) {
      const image = document.createElement('img')
      image.src = original.toDataURL()
      image.style.cssText = copy.style.cssText
      copy.replaceWith(image)
    }
  }
  // The original custom stylesheet remains active. Duplicating style elements
  // here would reapply their rules to the live card while preparing the export.
  card.querySelectorAll('style, .spine-animated').forEach((node) => node.remove())
  const pseudoStyle = document.createElement('style')
  pseudoStyle.textContent = pseudos.join('\n')
  card.appendChild(pseudoStyle)
  card.querySelectorAll<HTMLElement>('.workspace-portrait-scrim, .workspace-portrait-cue')
    .forEach((node) => { node.style.opacity = '0' })
  card.querySelectorAll<HTMLElement>('.spine-setup, .stat-muted')
    .forEach((node) => { node.style.opacity = '1' })

  // Keep the existing grade/score alignment protection, using live geometry
  // but changing only the copy. Font embedding must not move this composition.
  const figure = source.querySelector<HTMLElement>('.showcase-verdict-figure')
  const figureCopy = card.querySelector<HTMLElement>('.showcase-verdict-figure')
  if (figure && figureCopy) {
    const bounds = figure.getBoundingClientRect()
    if (bounds.width > 0 && bounds.height > 0) {
      Object.assign(figureCopy.style, {
        display: 'block', position: 'relative', flex: 'none',
        width: `${bounds.width}px`, height: `${bounds.height}px`,
      })
      for (const selector of ['.showcase-grade-mark', '.showcase-grade-score']) {
        const original = figure.querySelector<HTMLElement>(selector)
        const copy = figureCopy.querySelector<HTMLElement>(selector)
        if (!original || !copy) continue
        const rect = original.getBoundingClientRect()
        Object.assign(copy.style, {
          position: 'absolute', inset: 'auto', whiteSpace: 'nowrap',
          left: `${rect.left - bounds.left}px`, top: `${rect.top - bounds.top}px`,
          width: `${rect.width}px`, height: `${rect.height}px`,
        })
      }
    }
  }

  card.dataset.capturing = 'true'
  Object.assign(card.style, {
    position: 'relative', inset: 'auto', margin: '0', transform: 'none',
  })
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.inert = true
  Object.assign(host.style, {
    position: 'fixed', left: '-100000px', top: '0', pointerEvents: 'none',
    width: `${source.offsetWidth}px`, height: `${source.offsetHeight}px`,
  })
  host.appendChild(card)
  document.body.appendChild(host)
  return { card, fonts, text, dispose: () => host.remove() }
}

export async function loadCaptureArt(card: HTMLElement, loadResource?: (url: string) => Promise<string>): Promise<void> {
  const assets = new Map<string, Promise<string>>()
  const load = (url: string): Promise<string> => {
    if (loadResource) return loadResource(url)
    let asset = assets.get(url)
    if (!asset) {
      asset = fetch(url).then(async (response) => {
        if (!response.ok) throw new Error('The full-quality portrait could not be loaded. Please retry capture.')
        return blobToDataUrl(await response.blob())
      })
      assets.set(url, asset)
    }
    return asset
  }
  await Promise.all([
    ...Array.from(card.querySelectorAll<HTMLImageElement>('img[data-capture-src]'), async (image) => {
      image.removeAttribute('srcset')
      image.removeAttribute('sizes')
      image.src = await load(image.dataset.captureSrc!)
      await image.decode()
    }),
    ...Array.from(card.querySelectorAll<HTMLElement>('[data-capture-background]'), async (layer) => {
      const url = layer.dataset.captureBackground!
      const displayed = /url\(["']?([^)"']+)["']?\)/.exec(layer.dataset.displayBackground ?? '')?.[1]
      const displayUrl = new URL(displayed ?? url.replace('/setup/', '/setup/display/'), document.baseURI).href
      // Custom CSS may override the default background without changing props.
      if (!layer.style.backgroundImage.includes(displayUrl)) return
      layer.style.backgroundImage = layer.style.backgroundImage.replace(displayUrl, await load(url))
    }),
  ])
  await Promise.all(Array.from(card.querySelectorAll('img'), (image) => image.decode()))
}

let captureInProgress = false
export async function renderBuildCardPng(source: HTMLElement): Promise<Blob> {
  if (captureInProgress) throw new Error('A build card capture is already in progress.')
  captureInProgress = true
  let dispose: (() => void) | undefined
  const resources = makeCaptureResources()
  try {
    await waitForFontStylesheets()
    await document.fonts?.ready
    const width = source.offsetWidth
    const height = source.offsetHeight
    if (!width || !height) throw new Error('The build card is not visible.')
    const snapshot = createCaptureClone(source)
    dispose = snapshot.dispose
    const card = snapshot.card
    await loadCaptureArt(card, resources.load)
    const faces = await buildFontEmbedCss(snapshot.fonts, snapshot.text, resources.load)
    // One frozen tree: inline its resources, then serialize it directly.
    for (const node of [card, ...card.querySelectorAll<HTMLElement | SVGElement>('*')]) {
      if (node.style?.cssText?.includes('url(')) node.style.cssText = await embedCaptureUrls(node.style.cssText, resources.load)
      if (node instanceof HTMLImageElement) { node.src = await resources.load(node.src); await node.decode() }
      if (node.tagName === 'STYLE' && node.textContent) node.textContent = await embedCaptureUrls(node.textContent, resources.load)
    }
    const fontStyle = document.createElement('style')
    fontStyle.textContent = faces
    card.insertBefore(fontStyle, card.firstChild)
    return await rasterizeCard(card, { width, height, pixelRatio: 3 })
  } finally {
    dispose?.(); resources.dispose(); captureInProgress = false
  }
}

export function downloadBuildCard(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'build'}-card.png`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function copyBuildCard(blob: Promise<Blob>): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Image clipboard is not supported by this browser')
  }
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': blob }),
  ])
}
