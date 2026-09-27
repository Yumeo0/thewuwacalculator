/*
  Author: Runor Ewhro
  Description: Verifies measured derivative selection, density and transform
               updates, fallback preservation, and shared observer cleanup.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const source = '/assets/game/attributes/icons/glacio.webp'
class FakeImage {
  width = 26
  attributes = new Map<string, string>()
  writes: string[] = []
  get src() { return this.attributes.get('src') ?? '' }
  set src(value: string) { this.attributes.set('src', value); this.writes.push(value) }
  getAttribute(name: string) { return this.attributes.get(name) ?? null }
  removeAttribute(name: string) { this.attributes.delete(name) }
  getBoundingClientRect() { return { width: this.width } }
  element() { return this as unknown as HTMLImageElement }
}

let resize: () => void
let resizeObserver: { observe: ReturnType<typeof vi.fn>; unobserve: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }
let windowEvents: EventTarget & { devicePixelRatio: number }
let documentEvents: EventTarget
let densityQueries: EventTarget[]
let cleanups: Array<() => void>
beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  cleanups = []
  densityQueries = []
  windowEvents = Object.assign(new EventTarget(), {
    devicePixelRatio: 2,
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0),
    cancelAnimationFrame: clearTimeout,
    matchMedia: () => { const query = new EventTarget(); densityQueries.push(query); return query },
  })
  documentEvents = new EventTarget()
  vi.stubGlobal('window', windowEvents)
  vi.stubGlobal('document', documentEvents)
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
    constructor(callback: () => void) {
      resize = callback
      resizeObserver = { observe: this.observe, unobserve: this.unobserve, disconnect: this.disconnect }
    }
  })
})
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup())
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('measured display images', () => {
  it('requests only the closest source initially and follows growth and shrinkage', async () => {
    const { observeDisplayImage } = await import('../displayImageSizing')
    const image = new FakeImage()
    cleanups.push(observeDisplayImage(image.element(), source))
    expect(image.writes).toHaveLength(1)
    expect(image.src).toMatch(/-64.webp$/)
    image.width = 70
    resize()
    vi.runAllTimers()
    expect(image.src).toMatch(/-128.webp$/)
    image.width = 34
    resize()
    vi.runAllTimers()
    expect(image.src).toMatch(/-64.webp$/)
    resize()
    vi.runAllTimers()
    expect(image.writes).toHaveLength(3)
  })

  it('reselects after screen density and ancestor transform changes', async () => {
    const { observeDisplayImage } = await import('../displayImageSizing')
    const image = new FakeImage()
    image.width = 34
    cleanups.push(observeDisplayImage(image.element(), source))
    windowEvents.devicePixelRatio = 3
    densityQueries[0].dispatchEvent(new Event('change'))
    vi.runAllTimers()
    expect(image.src).toMatch(/-128.webp$/)
    expect(densityQueries).toHaveLength(2)
    image.width = 12
    documentEvents.dispatchEvent(new Event('transitionend'))
    vi.runAllTimers()
    expect(image.src).toMatch(/-64.webp$/)
  })

  it('waits for hidden images to have a size and preserves fallback URLs', async () => {
    const { observeDisplayImage } = await import('../displayImageSizing')
    const image = new FakeImage()
    image.width = 0
    cleanups.push(observeDisplayImage(image.element(), source))
    expect(image.writes).toEqual([])
    image.width = 26
    resize()
    vi.runAllTimers()
    expect(image.src).toMatch(/-64.webp$/)
    image.src = source
    image.width = 100
    resize()
    vi.runAllTimers()
    expect(image.src).toBe(source)
    image.src = '/assets/game/default.webp'
    resize()
    vi.runAllTimers()
    expect(image.src).toBe('/assets/game/default.webp')
  })

  it('releases observers and pending work when the final image unmounts', async () => {
    const { observeDisplayImage } = await import('../displayImageSizing')
    const first = new FakeImage()
    const second = new FakeImage()
    const stopFirst = observeDisplayImage(first.element(), source)
    const stopSecond = observeDisplayImage(second.element(), source)
    resize()
    stopFirst()
    expect(resizeObserver.disconnect).not.toHaveBeenCalled()
    stopSecond()
    expect(resizeObserver.unobserve).toHaveBeenCalledTimes(2)
    expect(resizeObserver.disconnect).toHaveBeenCalledOnce()
    vi.runAllTimers()
    windowEvents.dispatchEvent(new Event('resize'))
    expect(vi.getTimerCount()).toBe(0)
    expect(first.writes).toHaveLength(1)
    expect(second.writes).toHaveLength(1)
  })

  it('passes custom artwork through without observing it', async () => {
    const { observeDisplayImage } = await import('../displayImageSizing')
    const image = new FakeImage()
    image.width = 0
    cleanups.push(observeDisplayImage(image.element(), 'blob:custom'))
    expect(image.src).toBe('blob:custom')
    expect(densityQueries).toHaveLength(0)
  })
})
