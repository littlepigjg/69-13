import moment from 'moment'

export const DEFAULT_TAG_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
  '#06b6d4', '#64748b'
]

export function pickTagColor(index) {
  return DEFAULT_TAG_COLORS[index % DEFAULT_TAG_COLORS.length]
}

export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function isTagDeleted(tag) {
  return !!(tag && tag.deleted && tag.deleted !== 0)
}

export function getTagDisplayName(tag) {
  if (!tag) return ''
  return tag.name || ''
}

export function formatTagUsageCount(count) {
  if (count === undefined || count === null) return ''
  if (count < 1000) return `${count}次`
  if (count < 10000) return `${(count / 1000).toFixed(1)}k次`
  return `${Math.round(count / 1000)}k次`
}

export function calculateTagStats(results, tagId) {
  if (!results || results.length === 0) {
    return { count: 0, failedCount: 0, avgDuration: 0, servicesAffected: new Set() }
  }
  const tagged = results.filter(r =>
    r.tags && r.tags.some(t => t.id === tagId)
  )
  const failed = tagged.filter(r => !r.success && !r.is_maintenance)
  const services = new Set(tagged.map(r => r.service_id))

  let avgDuration = 0
  if (failed.length >= 2) {
    let totalGap = 0
    let gapCount = 0
    for (let i = 0; i < failed.length - 1; i++) {
      const t1 = new Date(failed[i].timestamp)
      const t2 = new Date(failed[i + 1].timestamp)
      const diff = Math.abs(t1 - t2) / 1000
      if (diff < 3600) {
        totalGap += diff
        gapCount++
      }
    }
    if (gapCount > 0) avgDuration = Math.round(totalGap / gapCount)
  }

  return {
    count: tagged.length,
    failedCount: failed.length,
    avgDuration,
    servicesAffected: services,
    servicesCount: services.size
  }
}

export function groupTagsByUsage(tags) {
  if (!tags || tags.length === 0) return []
  return [...tags].sort((a, b) => {
    const ua = a.usage_count || 0
    const ub = b.usage_count || 0
    return ub - ua
  })
}

export function parseTagNames(input) {
  if (!input) return []
  return input
    .split(/[,，\s]+/)
    .map(s => s.trim())
    .filter(Boolean)
}

export function normalizeTags(tags) {
  if (!tags || tags.length === 0) return []
  const seen = new Set()
  const result = []
  for (const tag of tags) {
    const key = tag.id || tag.name
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(tag)
  }
  return result
}
