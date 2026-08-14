/*
  Turn a picked image file into a data URI small enough to keep in a table row.

  Used for the signature and company stamp. These are deliberately NOT uploaded
  to the company-assets bucket: that bucket is public, so an uploaded signature
  would be downloadable by anyone holding the link. Kept as a data URI on the
  quotation_templates row there is no URL at all, and the image embeds directly
  into the printed document.

  PNG is kept (not JPEG) because a signature or stamp is normally a transparent
  cut-out that has to sit over the ruled signing line without a white box
  around it. If the source is huge we step the width down rather than switching
  format, so transparency survives.
*/

const DEFAULT_WIDTHS = [600, 460, 360, 280]

function readAsImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image')) }
    img.src = url
  })
}

function drawToDataUri(img, targetWidth) {
  const scale = Math.min(1, targetWidth / (img.naturalWidth || targetWidth))
  const w = Math.max(1, Math.round((img.naturalWidth || targetWidth) * scale))
  const h = Math.max(1, Math.round((img.naturalHeight || targetWidth) * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, w, h)          // keep transparency rather than painting white
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/png')
}

// Rough byte size of a data URI payload (base64 is 4 chars per 3 bytes).
export function dataUriBytes(uri) {
  const i = String(uri || '').indexOf(',')
  if (i < 0) return 0
  return Math.round((String(uri).length - i - 1) * 0.75)
}

export function formatBytes(n) {
  if (!n) return '0 KB'
  return n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`
}

/*
  fileToDataUri(file, { maxBytes })
  Resolves to a PNG data URI, stepping the width down until it fits.
  Throws with a message meant to be shown to the user.
*/
export async function fileToDataUri(file, { maxBytes = 400_000, widths = DEFAULT_WIDTHS } = {}) {
  if (!file) throw new Error('No file selected')
  if (!/^image\//.test(file.type)) throw new Error('Please choose an image file (PNG or JPG)')
  if (file.size > 12 * 1024 * 1024) throw new Error('That image is very large. Please crop it first.')

  const img = await readAsImage(file)
  let last = ''
  for (const w of widths) {
    last = drawToDataUri(img, w)
    if (dataUriBytes(last) <= maxBytes) return last
  }
  throw new Error(
    `Image is still ${formatBytes(dataUriBytes(last))} after resizing. ` +
    'Crop it tight around the signature and save as a transparent PNG.'
  )
}
