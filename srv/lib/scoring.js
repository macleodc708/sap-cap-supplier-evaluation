import cds from '@sap/cds'

/** Gewichtung der Kriterien (konfigurierbar in package.json -> cds.evaluation.weights) */
const weights = () => cds.env.evaluation?.weights ?? { quality: 0.35, delivery: 0.3, price: 0.2, communication: 0.15 }

/** Gewichtete Gesamtnote 1,00 - 5,00; null, solange nicht alle Kriterien bewertet sind */
export function overallScore(scores) {
  const w = weights()
  const criteria = Object.keys(w)
  if (criteria.some(c => scores[c] == null)) return null
  const total = criteria.reduce((sum, c) => sum + Number(scores[c]) * w[c], 0)
  return Math.round(total * 100) / 100
}

/** ABC-Klassifizierung: A ab 4,0 · B ab 3,0 · sonst C */
export function ratingFor(score) {
  if (score == null) return null
  return score >= 4 ? 'A' : score >= 3 ? 'B' : 'C'
}

export const today = () => new Date().toISOString().slice(0, 10)
