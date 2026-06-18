// HeroActions — teleports a page's primary action buttons into the global
// OS hero (the "#os-hero-actions" slot). Lets each page keep its actions in
// its own code while they render on the right side of the shared hero header.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export default function HeroActions({ children }) {
  const [el, setEl] = useState(null)
  useEffect(() => {
    setEl(document.getElementById('os-hero-actions'))
  }, [])
  return el ? createPortal(children, el) : null
}
