import React from 'react'

export function TagBadge({ tag, onRemove, size = 'md', style }) {
  if (!tag) return null
  const color = tag.color || '#6366f1'
  const sizes = {
    sm: { padding: '2px 8px', fontSize: 11 },
    md: { padding: '3px 10px', fontSize: 12 },
    lg: { padding: '5px 14px', fontSize: 13 }
  }
  const s = sizes[size] || sizes.md
  const bgLight = hexToRgba(color, 0.12)

  return (
    <span
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
      <span>{tag.name}</span>
      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove?.(tag) }}
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

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
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
