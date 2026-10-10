import { describe, it, expect } from 'vitest'
import { normalizeLanguage, normalizeLanguageList, operatorCoversLanguage, languageLabel } from '@/lib/languages'
import { rankOperators, pickOperator, type OperatorCandidate } from '@/lib/assignment/policy'
import { deriveOutcome } from '@/lib/qa/reviews'

const op = (id: string, languages: string[], used = 0, capacity = 2): OperatorCandidate => ({ operatorId: id, languages, capacity, activeAssignmentCount: used, status: 'AVAILABLE' })

describe('language normalisation', () => {
  it('accepts ISO codes with optional region, rejects everything else', () => {
    expect(normalizeLanguage('ES')).toBe('es')
    expect(normalizeLanguage('es-MX')).toBe('es')
    expect(normalizeLanguage('pt_br')).toBe('pt')
    for (const bad of ['', '  ', 'spanish', 'e', 'es es', '<script>', null, undefined]) expect(normalizeLanguage(bad as never)).toBeNull()
  })
  it('lists are de-duplicated, sorted and cleaned', () => {
    expect(normalizeLanguageList(['ES', 'en', 'es-AR', 'x', ''])).toEqual(['en', 'es'])
  })
  it('labels known codes and is explicit about unknown ones', () => {
    expect(languageLabel('es')).toBe('Spanish')
    expect(languageLabel(null)).toBe('Unspecified')
    expect(languageLabel('xx')).toBe('XX')
  })
})

describe('operatorCoversLanguage', () => {
  it('unknown conversation language or unrestricted operator keeps the existing behaviour', () => {
    expect(operatorCoversLanguage(['en'], null)).toBe(true)
    expect(operatorCoversLanguage([], 'es')).toBe(true)
  })
  it('a restricted operator must list the language', () => {
    expect(operatorCoversLanguage(['en', 'es'], 'es')).toBe(true)
    expect(operatorCoversLanguage(['en'], 'es')).toBe(false)
    expect(operatorCoversLanguage(['en', 'es'], 'ES-mx')).toBe(true)
  })
})

describe('rankOperators with language', () => {
  it('only operators covering the language are eligible', () => {
    const ranked = rankOperators([op('a', ['en']), op('b', ['es']), op('c', ['en', 'es'])], 'es')
    expect(ranked.map((r) => r.operatorId).sort()).toEqual(['b', 'c'])
  })
  it('no covering operator -> nobody (the conversation waits instead of going to the wrong language)', () => {
    expect(pickOperator([op('a', ['en']), op('b', ['fr'])], 'es')).toBeNull()
  })
  it('capacity and load balancing still apply among covering operators', () => {
    expect(pickOperator([op('a', ['es'], 2), op('b', ['es'], 1), op('c', ['es'], 0)], 'es')?.operatorId).toBe('c')
    expect(pickOperator([op('a', ['es'], 2)], 'es')).toBeNull()
  })
  it('without a language the previous behaviour is unchanged', () => {
    expect(rankOperators([op('a', ['en']), op('b', ['es'])]).length).toBe(2)
  })
})

describe('QA outcome', () => {
  it('derives PASS / COACHING / FAIL from the three scores', () => {
    expect(deriveOutcome(5, 5, 4)).toBe('PASS')
    expect(deriveOutcome(4, 4, 4)).toBe('PASS')
    expect(deriveOutcome(5, 3, 4)).toBe('COACHING')
    expect(deriveOutcome(3, 3, 3)).toBe('COACHING')
    expect(deriveOutcome(5, 5, 2)).toBe('FAIL')
    expect(deriveOutcome(1, 1, 1)).toBe('FAIL')
  })
})
