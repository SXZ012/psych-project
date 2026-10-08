/** Validate remotely managed content before it replaces the bundled edition. */
export function validLibrary(value: unknown, expectedIds: string[]): boolean {
  if (!value || typeof value !== 'object') return false
  const payload = value as Record<string, unknown>
  if (!Array.isArray(payload.scales) || !Array.isArray(payload.selfScales)
    || !Array.isArray(payload.officialResources) || !payload.scienceDetails
    || typeof payload.scienceDetails !== 'object') return false
  if (payload.scales.length !== expectedIds.length || payload.selfScales.length !== expectedIds.length) return false
  const text = (item: unknown): item is string => typeof item === 'string' && item.trim().length > 0
  for (let index = 0; index < expectedIds.length; index++) {
    const scale = payload.scales[index]
    const card = payload.selfScales[index]
    if (!scale || !card || scale.short !== expectedIds[index] || card.short !== expectedIds[index]
      || !text(scale.title) || !text(scale.source) || !text(card.title) || !text(card.category)
      || !Array.isArray(scale.questions) || !scale.questions.length || !scale.questions.every(text)
      || !Array.isArray(scale.levels)) return false
    if (scale.options && (!Array.isArray(scale.options) || scale.options.length < 2 || !scale.options.every(text))) return false
    if (scale.optionsByQuestion && (!Array.isArray(scale.optionsByQuestion)
      || scale.optionsByQuestion.length !== scale.questions.length
      || !scale.optionsByQuestion.every((options: unknown) => Array.isArray(options) && options.length >= 2 && options.every(text)))) return false
    if (scale.scoreMaps && (!Array.isArray(scale.scoreMaps) || scale.scoreMaps.length !== scale.questions.length
      || !scale.scoreMaps.every((scores: unknown, item: number) => Array.isArray(scores)
        && scores.length === (scale.optionsByQuestion?.[item]?.length || scale.options?.length || 4)
        && scores.every(score => Number.isFinite(score) && score >= 0)))) return false
    if (!scale.levels.every((level: unknown) => Array.isArray(level) && level.length === 2 && Number.isFinite(level[0]) && text(level[1]))) return false
  }
  if (!payload.officialResources.length) return false
  const details = payload.scienceDetails as Record<string, unknown>
  const titles = new Set<string>()
  for (const resource of payload.officialResources) {
    if (!resource || !text(resource.title) || titles.has(resource.title) || !text(resource.source)
      || !text(resource.url) || !resource.url.startsWith('https://')
      || !['science', 'course', 'service'].includes(resource.kind)) return false
    titles.add(resource.title)
    const sections = details[resource.title]
    if (!Array.isArray(sections) || !sections.length || !sections.every(section => section
      && text(section.title) && Array.isArray(section.paragraphs) && section.paragraphs.length
      && section.paragraphs.every(text))) return false
  }
  return true
}
