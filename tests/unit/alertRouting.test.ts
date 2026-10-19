import { describe, it, expect } from 'vitest'
import { routeDelivers, DEFAULT_ROUTES } from '@/lib/notify/service'

describe('alert routing by severity', () => {
  it('delivers from the configured severity upward, and never when disabled', () => {
    const warn = { minSeverity: 'warning', enabled: true }
    expect(routeDelivers(warn, 'critical')).toBe(true)
    expect(routeDelivers(warn, 'warning')).toBe(true)
    expect(routeDelivers(warn, 'info')).toBe(false)
    expect(routeDelivers({ minSeverity: 'critical', enabled: true }, 'warning')).toBe(false)
    expect(routeDelivers({ minSeverity: 'info', enabled: true }, 'info')).toBe(true)
    expect(routeDelivers({ minSeverity: 'info', enabled: false }, 'critical')).toBe(false)
  })
  it('defaults never route alerts to clients, operators or hunters', () => {
    const roles = DEFAULT_ROUTES.map((r) => r.role)
    for (const r of ['CLIENT', 'OPERATOR', 'HUNTER']) expect(roles).not.toContain(r)
  })
})
