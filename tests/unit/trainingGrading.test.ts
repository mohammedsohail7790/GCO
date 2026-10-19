import { describe, it, expect } from 'vitest'
import { gradeTest, stripAnswers, validateQuestions, type Question } from '@/lib/training/grading'

const qs: Question[] = [
  { q: 'Can you share another client\'s data?', options: ['Yes', 'No', 'Maybe'], correct: 1 },
  { q: 'Who approves routine replies?', options: ['Nobody - you send them', 'A manager'], correct: 0 },
  { q: 'Escalate when…?', options: ['Never', 'You cannot resolve it safely'], correct: 1 },
  { q: 'Language of the customer?', options: ['Ignore', 'Reply in it'], correct: 1 },
]
describe('training grading', () => {
  it('scores the share of correct answers; blanks and out-of-range are wrong', () => {
    expect(gradeTest(qs, [1, 0, 1, 1])).toEqual({ score: 100, correct: 4, total: 4 })
    expect(gradeTest(qs, [1, 1, 1, 0])).toMatchObject({ score: 50, correct: 2 })
    expect(gradeTest(qs, [1, 0, 1, 99])).toMatchObject({ score: 75 })
    expect(gradeTest(qs, [])).toMatchObject({ score: 0 })
    expect(gradeTest(qs, 'nonsense')).toMatchObject({ score: 0 })
  })
  it('never exposes the correct answers', () => {
    expect(JSON.stringify(stripAnswers(qs))).not.toContain('correct')
  })
  it('validates question sets', () => {
    expect(validateQuestions(qs)).toBeNull()
    expect(validateQuestions([])).toMatch(/1-40/)
    expect(validateQuestions([{ q: 'Valid question?', options: ['a'], correct: 0 }])).toMatch(/options/)
    expect(validateQuestions([{ q: 'Valid question?', options: ['a', 'b'], correct: 2 }])).toMatch(/correct/)
    expect(validateQuestions([{ q: 'x', options: ['a', 'b'], correct: 0 }])).toMatch(/text/)
  })
})
