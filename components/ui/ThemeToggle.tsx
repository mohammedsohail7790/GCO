'use client'

import { useEffect, useState } from 'react'

const KEY = 'gco-theme'

/** Light / dark switch for the signed-in product. The choice is remembered on this device; the public site is never affected. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const on = localStorage.getItem(KEY) === 'dark'
    document.documentElement.classList.toggle('app-dark', on)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(on)
    return () => document.documentElement.classList.remove('app-dark') // leaving the product restores the public look
  }, [])
  const flip = () => {
    const next = !dark
    setDark(next)
    localStorage.setItem(KEY, next ? 'dark' : 'light')
    document.documentElement.classList.toggle('app-dark', next)
  }
  return (
    <button onClick={flip} aria-pressed={dark} title={dark ? 'Switch to light mode' : 'Switch to dark mode'} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
      {dark ? 'Light mode' : 'Dark mode'}
    </button>
  )
}
