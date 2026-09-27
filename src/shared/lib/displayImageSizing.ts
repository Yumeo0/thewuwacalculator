/*
  Author: Runor Ewhro
  Description: Selects generated image derivatives from measured display size and
               pixel density while sharing observers across mounted images.
*/
import { resolveDisplayImage } from './displayAssets'

const sources = new Map<HTMLImageElement, string>()
const selectedSources = new WeakMap<HTMLImageElement, string>()
let observer: ResizeObserver | undefined
let densityQuery: MediaQueryList | undefined
let frame: number | undefined

export function currentPixelRatio() {
  return typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
}

export function loadDisplayImage(image: HTMLImageElement, source: string) {
  const width = image.getBoundingClientRect().width
  if (width <= 0) return
  const asset = resolveDisplayImage(source, width, currentPixelRatio())
  image.removeAttribute('srcset')
  image.removeAttribute('sizes')
  if (image.getAttribute('src') !== asset.src) image.src = asset.src
  selectedSources.set(image, asset.src)
}

function refresh() {
  frame = undefined
  // Read all layout bounds before changing any image URLs.
  const updates = Array.from(sources, ([image, source]) => ({
    image, source, width: image.getBoundingClientRect().width,
  }))
  for (const { image, source, width } of updates) {
    // A failed derivative falls back to canonical art until the source changes.
    const current = image.getAttribute('src')
    if (width <= 0 || (current && current !== selectedSources.get(image))) continue
    const asset = resolveDisplayImage(source, width, currentPixelRatio())
    if (image.getAttribute('src') !== asset.src) image.src = asset.src
    selectedSources.set(image, asset.src)
  }
}

function scheduleRefresh() {
  if (frame === undefined) frame = window.requestAnimationFrame(refresh)
}

function watchDensity() {
  densityQuery?.removeEventListener('change', onDensityChange)
  densityQuery = window.matchMedia?.(`(resolution: ${currentPixelRatio()}dppx)`)
  densityQuery?.addEventListener('change', onDensityChange)
}

function onDensityChange() {
  watchDensity()
  scheduleRefresh()
}

export function observeDisplayImage(image: HTMLImageElement, source: string) {
  if (!resolveDisplayImage(source, 0).srcSet) {
    if (image.getAttribute('src') !== source) image.src = source
    return () => {}
  }
  if (sources.size === 0) {
    observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(scheduleRefresh)
    window.addEventListener('resize', scheduleRefresh)
    // Transforms can change displayed width without changing the layout box.
    document.addEventListener('transitionend', scheduleRefresh)
    watchDensity()
  }
  sources.set(image, source)
  observer?.observe(image)
  loadDisplayImage(image, source)
  return () => {
    sources.delete(image)
    observer?.unobserve(image)
    if (sources.size) return
    observer?.disconnect()
    observer = undefined
    window.removeEventListener('resize', scheduleRefresh)
    document.removeEventListener('transitionend', scheduleRefresh)
    densityQuery?.removeEventListener('change', onDensityChange)
    densityQuery = undefined
    if (frame !== undefined) window.cancelAnimationFrame(frame)
    frame = undefined
  }
}
