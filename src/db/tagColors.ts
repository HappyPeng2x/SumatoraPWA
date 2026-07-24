// Color-by-category for schema-v2 Tag chips, echoing the Android app's
// TagSystem/RoundedTagSpan (a distinct solid color per Tag.category) —
// see ui-parity-and-remote-search-plan.md, Phase B.
const CATEGORY_CLASSES: Record<string, string> = {
  pos: 'bg-indigo-700 text-indigo-100',
  misc: 'bg-amber-700 text-amber-100',
  field: 'bg-emerald-700 text-emerald-100',
  dialect: 'bg-rose-700 text-rose-100',
  form: 'bg-violet-700 text-violet-100',
  name_type: 'bg-sky-700 text-sky-100',
  source: 'bg-fuchsia-700 text-fuchsia-100',
}

const DEFAULT_CLASSES = 'bg-slate-700 text-slate-200'

export function tagChipClasses(category: string): string {
  return CATEGORY_CLASSES[category] ?? DEFAULT_CLASSES
}
