import React, { useState, useEffect } from 'react'
import { TagBadge } from './TagBadge.jsx'
import { groupTagsByUsage } from './tagUtils.js'

export function TagCloud({ onSelectTag, limit = 10 }) {
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTags()
  }, [limit])

  const loadTags = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tags/popular?limit=${limit}`)
      if (res.ok) {
        const data = await res.json()
        setTags(groupTagsByUsage(data))
      }
    } catch (e) {
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ color: '#9ca3af', fontSize: 13 }}>加载中...</div>
    )
  }

  if (tags.length === 0) {
    return (
      <div style={{ color: '#9ca3af', fontSize: 13 }}>暂无标签数据</div>
    )
  }

  const maxCount = Math.max(...tags.map(t => t.usage_count || 0), 1)

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 10,
      alignItems: 'center'
    }}>
      {tags.map(tag => {
        const count = tag.usage_count || 0
        const ratio = maxCount > 0 ? count / maxCount : 0
        const fontSize = 12 + Math.round(ratio * 10)
        const opacity = 0.6 + ratio * 0.4
        return (
          <span
            key={tag.id}
            onClick={() => onSelectTag?.(tag)}
            style={{
              cursor: onSelectTag ? 'pointer' : 'default',
              transition: 'transform 0.15s',
              opacity
            }}
            onMouseEnter={e => {
              if (onSelectTag) e.currentTarget.style.transform = 'scale(1.05)'
            }}
            onMouseLeave={e => {
              if (onSelectTag) e.currentTarget.style.transform = 'scale(1)'
            }}
          >
            <TagBadge
              tag={tag}
              size="md"
              style={{ fontSize }}
            />
            {count > 0 && (
              <span style={{
                fontSize: 11,
                color: '#9ca3af',
                marginLeft: 4,
                fontWeight: 600
              }}>
                ×{count}
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}

export default TagCloud
