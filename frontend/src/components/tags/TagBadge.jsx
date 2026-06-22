import React from 'react'
import { hexToRgba, isTagDeleted } from './tagUtils.js'

export function TagBadge({ tag, onRemove, size = 'md', style, showDeleted = true }) {
  if (!tag) return null
  const deleted = showDeleted && isTagDeleted(tag)
  const baseColor = tag.color || '#6366f1'
  const color = deleted ? '#9ca3af' : baseColor
  const sizes = {
    sm: { padding: '2px 8px', fontSize: 11 },
    md: { padding: '3px 10px', fontSize: 12 },
    lg: { padding: '5px 14px', fontSize: 13 }
  }
  const s = sizes[size] || sizes.md
  const bgLight = deleted ? 'rgba(156, 163, 175, 0.12)' : hexToRgba(color, 0.12)

  const btnTitle = deleted
    ? '移除与该已删除标签的关联'
    : undefined

  return (
    <span
      title={deleted ? '该标签已删除（历史记录保留）' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        ...s,
        borderRadius: 999,
        background: bgLight,
        color: color,
        fontWeight: 600,
        lineHeight: 1.4,
        opacity: deleted ? 0.7 : 1,
        ...style
      }}
    >
      <span
        style={{
          width: size === 'sm' ? 5 : 6,
          height: size === 'sm' ? 5 : 6,
          borderRadius: '50%',
          background: color,
          flexShrink: 0
        }}
      />
      <span style={{
        textDecoration: deleted ? 'line-through' : 'none',
        fontStyle: deleted ? 'italic' : 'normal'
      }}>{tag.name}</span>
      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove?.(tag) }}
          title={btnTitle}
          style={{
            border: 'none',
            background: 'none',
            color: 'inherit',
            cursor: 'pointer',
            padding: 0,
            fontSize: size === 'sm' ? 12 : 14,
            lineHeight: 1,
            opacity: 0.7,
            fontWeight: 700
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = 1}
          onMouseLeave={e => e.currentTarget.style.opacity = 0.7}
        >
          ×
        </button>
      )}
    </span>
  )
}

export function TagBadgeList({ tags, onRemoveTag, size = 'sm' }) {
  if (!tags || tags.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {tags.map(tag => (
        <TagBadge
          key={tag.id || tag.name}
          tag={tag}
          onRemove={onRemoveTag}
          size={size}
        />
      ))}
    </div>
  )
}

export default TagBadge
