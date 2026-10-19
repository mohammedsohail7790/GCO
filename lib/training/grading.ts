export interface Question { q: string; options: string[]; correct: number }

/** Validates a question set; returns an error message or null. */
export function validateQuestions(qs: unknown): string | null {
  if (!Array.isArray(qs) || qs.length < 1 || qs.length > 40) return 'A test needs 1-40 questions'
  for (const [i, q] of qs.entries()) {
    if (!q || typeof q !== 'object') return `Question ${i + 1} is invalid`
    const { q: text, options, correct } = q as Question
    if (typeof text !== 'string' || text.trim().length < 3 || text.length > 500) return `Question ${i + 1}: text must be 3-500 characters`
    if (!Array.isArray(options) || options.length < 2 || options.length > 6 || options.some((o) => typeof o !== 'string' || !o.trim() || o.length > 300)) return `Question ${i + 1}: 2-6 non-empty options`
    if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) return `Question ${i + 1}: the correct answer must be one of the options`
  }
  return null
}

/** Pure scoring: percentage of correct answers (unanswered or out-of-range counts as wrong). */
export function gradeTest(questions: Question[], answers: unknown): { score: number; correct: number; total: number } {
  const given = Array.isArray(answers) ? answers : []
  const correct = questions.filter((q, i) => given[i] === q.correct).length
  return { score: Math.round((correct / questions.length) * 100), correct, total: questions.length }
}

/** What an operator may see of a test: never the correct answers. */
export const stripAnswers = (qs: Question[]) => qs.map((q) => ({ q: q.q, options: q.options }))
