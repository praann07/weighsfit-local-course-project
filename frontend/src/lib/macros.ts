import type { Goal, Macros } from '@/types'

/** Exponential moving average over a daily series, gaps carried forward (used to smooth the weight trend). */
export function ema(values: (number | null)[], alpha = 0.25): (number | null)[] {
  let current: number | null = null
  return values.map((v) => {
    if (v === null || Number.isNaN(v)) return current
    current = current === null ? v : alpha * v + (1 - alpha) * current
    return current
  })
}

/**
 * Turn a calorie number into macro targets: protein from bodyweight, fat as a share of calories,
 * carbs take whatever is left.
 */
export function macrosFromCalories(calories: number, weightKg: number, goal: Goal): Macros {
  const proteinPerKg = goal === 'cut' ? 2.2 : 1.9
  const protein_g = Math.round(weightKg * proteinPerKg)
  const fatShare = goal === 'cut' ? 0.25 : 0.27
  const fat_g = Math.round((calories * fatShare) / 9)
  const remaining = calories - protein_g * 4 - fat_g * 9
  const carbs_g = Math.max(0, Math.round(remaining / 4))
  return { calories: Math.round(calories), protein_g, carbs_g, fat_g }
}
