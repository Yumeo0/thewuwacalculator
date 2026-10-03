/*
  Author: Runor Ewhro
  Description: Rasterizes an already frozen card without cloning it or retaining capture resources.
*/

// WebKit decodes the data-URI images inside the SVG only when it is painted at
// a given size, after decode() has resolved, so an early draw has no artwork.
// Redraw at the output size until six frames in a row agree: an artless frame
// can hold for several polls before the artwork lands.
async function settleEmbeddedImages(image: HTMLImageElement, output: HTMLCanvasElement, context: CanvasRenderingContext2D): Promise<void> {
  const probe = document.createElement('canvas')
  probe.width = 128; probe.height = Math.max(1, Math.round(128 * output.height / output.width))
  const sample = probe.getContext('2d', { willReadFrequently: true })
  if (!sample) { context.drawImage(image, 0, 0); return }
  let previous = -1
  let stable = 0
  try {
    for (let attempt = 0; attempt < 40 && stable < 5; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      context.clearRect(0, 0, output.width, output.height)
      context.drawImage(image, 0, 0)
      sample.clearRect(0, 0, probe.width, probe.height)
      sample.drawImage(output, 0, 0, probe.width, probe.height)
      let frame = 0
      for (const value of sample.getImageData(0, 0, probe.width, probe.height).data) frame = (frame * 31 + value) | 0
      stable = frame === previous ? stable + 1 : 0
      previous = frame
    }
  } finally { probe.width = 0; probe.height = 0 }
}

// Lay the card out at the output resolution with CSS zoom and draw the SVG 1:1.
// WebKit misplaces and clips box-shadows when an SVG image is scaled at draw time.
export async function rasterizeCard(card: HTMLElement, { width, height, pixelRatio }: { width: number; height: number; pixelRatio: number }): Promise<Blob> {
  const outWidth = width * pixelRatio
  const outHeight = height * pixelRatio
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', String(outWidth)); svg.setAttribute('height', String(outHeight))
  svg.setAttribute('viewBox', `0 0 ${outWidth} ${outHeight}`)
  const foreign = document.createElementNS(svg.namespaceURI, 'foreignObject')
  foreign.setAttribute('width', '100%'); foreign.setAttribute('height', '100%')
  const scale = document.createElement('div')
  scale.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  Object.assign(scale.style, { zoom: String(pixelRatio), width: `${width}px`, height: `${height}px` })
  scale.appendChild(card)
  foreign.appendChild(scale); svg.appendChild(foreign)
  const image = new Image()
  const canvas = document.createElement('canvas')
  try {
    const source = new XMLSerializer().serializeToString(svg)
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
    await image.decode()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    canvas.width = outWidth; canvas.height = outHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Capture canvas is unavailable.')
    await settleEmbeddedImages(image, canvas, context)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Build card renderer returned no image')), 'image/png'))
  } finally {
    image.removeAttribute('src'); canvas.width = 0; canvas.height = 0
    scale.replaceChildren(); foreign.replaceChildren(); svg.replaceChildren()
  }
}
