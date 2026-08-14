import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/*
  In-app A4 document viewer.

  Printable documents render inside the app rather than in a window.open() pop-up.
  Pop-ups are blocked by default on iPad/iOS Safari, which is why the Statement
  of Account and LPO in ProjectsPage.jsx already work this way — this component
  is the same idea, packaged so other pages can reuse it.

  Printing goes through the host page (the overlay is the only thing left
  visible), so the browser takes the PDF filename from document.title. We swap
  the title for the duration of the print and put it back afterwards, which is
  the only reliable way to control the Save-as-PDF name.

  Props:
    doc      { title, html, filename } — null closes the viewer
    onClose  () => void
*/

const STYLE_ID = 'qvc-docview-style'
const CSS = `
#qvc-docview{position:fixed;inset:0;z-index:4000;background:#e9eef3;display:flex;flex-direction:column}
#qvc-docview *{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}
#qvc-docview .qvc-bar{flex-shrink:0;min-height:52px;background:#0f1d3a;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:8px 12px;gap:10px;flex-wrap:wrap}
#qvc-docview .qvc-title{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:'Inter','Segoe UI',sans-serif;min-width:0;flex:1}
#qvc-docview .qvc-bar button{padding:9px 15px;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-family:'Inter','Segoe UI',sans-serif;font-size:13px;white-space:nowrap}
#qvc-docview .qvc-scroll{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:16px 8px 48px}
#qvc-docview .qvc-sheet{width:794px;max-width:100%;min-height:1123px;margin:0 auto 16px;background:#fff;box-shadow:0 12px 44px rgba(15,30,50,.22);border-radius:2px}
@media (max-width:840px){
  #qvc-docview .qvc-scroll{padding:10px 6px 40px}
  #qvc-docview .qvc-sheet{min-height:0}
}
@media print{
  body>*:not(#qvc-docview){display:none!important}
  #qvc-docview{position:static!important;background:#fff!important;display:block!important}
  #qvc-docview .qvc-bar{display:none!important}
  #qvc-docview .qvc-scroll{overflow:visible!important;padding:0!important}
  #qvc-docview .qvc-sheet{width:auto!important;max-width:none!important;min-height:0!important;margin:0!important;box-shadow:none!important;border-radius:0!important}
  @page{size:A4;margin:11mm}
}`

export default function DocViewer({ doc, onClose }) {
  // Inject the stylesheet once, and stop the page behind the overlay scrolling.
  useEffect(() => {
    if (!document.getElementById(STYLE_ID)) {
      const el = document.createElement('style')
      el.id = STYLE_ID
      el.textContent = CSS
      document.head.appendChild(el)
    }
  }, [])

  useEffect(() => {
    if (!doc) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [doc, onClose])

  if (!doc) return null

  const doPrint = () => {
    const original = document.title
    if (doc.filename) document.title = doc.filename
    const restore = () => { document.title = original; window.removeEventListener('afterprint', restore) }
    window.addEventListener('afterprint', restore)
    // Safari never fires afterprint reliably — restore on a timer as well.
    setTimeout(restore, 4000)
    window.print()
  }

  return createPortal(
    <div id="qvc-docview" role="dialog" aria-modal="true" aria-label={doc.title || 'Document'}>
      <div className="qvc-bar">
        <span className="qvc-title">{doc.title || 'Document'}</span>
        <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={doPrint} style={{ background: '#0099cc', color: '#fff' }}>Print / Save PDF</button>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }}>Close</button>
        </span>
      </div>
      <div className="qvc-scroll">
        <div className="qvc-sheet" dangerouslySetInnerHTML={{ __html: doc.html }} />
      </div>
    </div>,
    document.body
  )
}
