import { useMemo, useState } from 'react'
import { CalendarDays, Pencil, Target } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { Field, NumberField } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useAsync, useAction } from '@/hooks/useAsync'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { nutritionService, progressService } from '@/services'
import { longDate } from '@/lib/date'
import { kcal, kg, num } from '@/lib/format'
import { MACRO_COLOR } from '@/lib/format'
import type { NutritionTarget } from '@/types'

export function NutritionTargetsPage() {
  const user = useAuthStore((s) => s.user)
  if (!user) return null

  return <TargetsView userId={user.id} goal={user.goal} />
}

function TargetsView({ userId, goal }: { userId: string; goal: 'bulk' | 'cut' | 'maintain' }) {
  const [editOpen, setEditOpen] = useState(false)

  const target = useAsync(() => nutritionService.currentTarget(userId), [userId])
  const history = useAsync(() => nutritionService.targetHistory(userId), [userId])
  const trend = useAsync(() => progressService.getTrend(userId, 90), [userId])

  const weightKg = trend.data?.current_trend_kg ?? 75

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Targets"
        subtitle="Your daily calorie and macro goals."
        actions={
          <Button onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" /> {target.data ? 'Change target' : 'Set target'}
          </Button>
        }
      />

      {target.loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader
              title="Current target"
              subtitle="Applied to today, and any day without a newer target"
              icon={<Target className="size-4" />}
            />
            <CardBody>
              {!target.data ? (
                <EmptyState title="No target set" description="Press “Set target” and enter your daily calories." />
              ) : (
                <TargetCard target={target.data} />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Target history"
              subtitle="Every target you've set, newest first"
              icon={<CalendarDays className="size-4" />}
            />
            <CardBody className="pt-1">
              {!history.data || history.data.length === 0 ? (
                <EmptyState title="No targets yet" description="Your targets will appear here." />
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {history.data.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold text-ink">{longDate(t.effective_date)}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-muted">
                          <span className="flex items-center gap-1.5">
                            <span className="size-1.5 rounded-full" style={{ background: MACRO_COLOR.protein }} aria-hidden />
                            P {t.protein_g}g
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="size-1.5 rounded-full" style={{ background: MACRO_COLOR.carbs }} aria-hidden />
                            C {t.carbs_g}g
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="size-1.5 rounded-full" style={{ background: MACRO_COLOR.fat }} aria-hidden />
                            F {t.fat_g}g
                          </span>
                        </p>
                      </div>
                      <span className="text-[15px] font-bold tabular-nums text-ink">{kcal(t.calories)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </>
      )}

      {editOpen && (
        <TargetModal
          userId={userId}
          goal={goal}
          weightKg={weightKg}
          initial={target.data}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            target.reload()
            history.reload()
          }}
        />
      )}
    </div>
  )
}

function TargetCard({ target }: { target: NutritionTarget }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Calories</p>
        <p className="text-[32px] font-bold leading-none tabular-nums tracking-tight text-ink">
          {num(target.calories, 0)}
        </p>
        <p className="mt-1 text-[12.5px] text-ink-faint">kcal per day</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ['Protein', target.protein_g, MACRO_COLOR.protein],
            ['Carbs', target.carbs_g, MACRO_COLOR.carbs],
            ['Fat', target.fat_g, MACRO_COLOR.fat],
          ] as const
        ).map(([label, value, color]) => (
          <div key={label} className="rounded-xl border border-line bg-surface-2/60 p-3">
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink-muted">
              <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
              {label}
            </span>
            <p className="mt-1 text-[20px] font-semibold tabular-nums leading-none text-ink">
              {value}
              <span className="text-[12px] font-medium text-ink-faint">g</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function TargetModal({
  userId,
  goal,
  weightKg,
  initial,
  onClose,
  onSaved,
}: {
  userId: string
  goal: 'bulk' | 'cut' | 'maintain'
  weightKg: number
  initial: NutritionTarget | null
  onClose: () => void
  onSaved: () => void
}) {
  const push = useToastStore((s) => s.push)
  const [calories, setCalories] = useState<number | null>(initial?.calories ?? 2000)

  const preview = useMemo(
    () => (calories !== null ? nutritionService.previewMacros(calories, weightKg, goal) : null),
    [calories, weightKg, goal],
  )

  const save = useAction((macros: NonNullable<typeof preview>) => nutritionService.setManualTarget(userId, macros))

  function submit() {
    if (!preview) return
    void save.run(preview).then((ok) => {
      if (ok === null) {
        push(save.error ?? 'Could not save target', 'error')
        return
      }
      push(`Target set to ${num(ok.calories, 0)} kcal`, 'success')
      onSaved()
      onClose()
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Set your daily target"
      description="Enter your calories; protein, carbs and fat are worked out for you."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.loading} disabled={calories === null || calories <= 0}>
            Save target
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Daily calories" hint={`Protein is based on your weight (${kg(weightKg, 2)}); carbs and fat adjust with calories.`}>
          <NumberField value={calories} onValueChange={setCalories} suffix="kcal" min={800} placeholder="2000" autoFocus />
        </Field>

        {preview && (
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ['Protein', preview.protein_g, MACRO_COLOR.protein],
                ['Carbs', preview.carbs_g, MACRO_COLOR.carbs],
                ['Fat', preview.fat_g, MACRO_COLOR.fat],
              ] as const
            ).map(([label, value, color]) => (
              <div key={label} className="rounded-xl border border-line bg-surface-2/60 p-3">
                <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink-muted">
                  <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
                  {label}
                </span>
                <p className="mt-1 text-[18px] font-semibold tabular-nums leading-none text-ink">
                  {value}
                  <span className="text-[12px] font-medium text-ink-faint">g</span>
                </p>
              </div>
            ))}
          </div>
        )}

        {save.error && (
          <p className="text-[12.5px] text-danger" role="alert">
            {save.error}
          </p>
        )}
      </div>
    </Modal>
  )
}
