/*
  Author: Runor Ewhro
  Description: Rasterizes an already frozen card without cloning it or retaining capture resources.
*/
export async function rasterizeCard(card: HTMLElement, { width, height, pixelRatio }: { width: number; height: number; pixelRatio: number }): Promise<Blob> {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height))
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  const foreign = document.createElementNS(svg.namespaceURI, 'foreignObject')
  foreign.setAttribute('width', '100%'); foreign.setAttribute('height', '100%')
  card.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  foreign.appendChild(card); svg.appendChild(foreign)
  const image = new Image()
  const canvas = document.createElement('canvas')
  try {
    const source = new XMLSerializer().serializeToString(svg)
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
    await image.decode()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    canvas.width = width * pixelRatio; canvas.height = height * pixelRatio
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Capture canvas is unavailable.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Build card renderer returned no image')), 'image/png'))
  } finally {
    image.removeAttribute('src'); canvas.width = 0; canvas.height = 0
    foreign.replaceChildren(); svg.replaceChildren()
  }
}
