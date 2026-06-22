import React, { useState, useEffect, useRef, useCallback } from 'react'
import { TagBadge } from './TagBadge.jsx'
import { normalizeTags } from './tagUtils.js'

export function TagInput({ value = [], onChange, placeholder = '输入标签，逗号分隔...', style }) {
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const containerRef = useRef(null)
  const debounceRef = useRef(null)

  const tagNames = value.map(t => t.name || t)

  const searchTags = useCallback(async (q) => {
    if (!q.trim()) {
      setSuggestions([])
      return
    }
    try {
      const res = await fetch(`/api/tags/search?q=${encodeURIComponent(q.trim())}&limit=15`)
      if (res.ok) {
        const data = await res.json()
        setSuggestions(data.filter(t => !tagNames.includes(t.name)))
      }
    } catch (e) {}
  }, [tagNames])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchTags(input), 200)
    return () => clearTimeout(debounceRef.current)
  }, [input, searchTags])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false)
        commitPending()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [input, value])

  const addTagByName = (name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (tagNames.includes(trimmed)) return
    const newTag = { name: trimmed, id: null, color: null, _new: true }
    const next = normalizeTags([...value, newTag])
    onChange?.(next)
    setInput('')
    setSuggestions([])
    setShowDropdown(false)
    setHighlightIdx(-1)
  }

  const addTag = (tag) => {
    if (tagNames.includes(tag.name)) return
    const next = normalizeTags([...value, tag])
    onChange?.(next)
    setInput('')
    setSuggestions([])
    setShowDropdown(false)
    setHighlightIdx(-1)
  }

  const removeTag = (tagToRemove) => {
    const next = value.filter(t =>
      (t.id && t.id !== tagToRemove.id) || (!t.id && t.name !== tagToRemove.name)
    )
    onChange?.(next)
  }

  const commitPending = () => {
    if (input.trim()) {
      const parts = input.split(/[,，\s]+/).filter(Boolean)
      for (const part of parts) {
        addTagByName(part)
      }
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
      e.preventDefault()
      if (highlightIdx >= 0 && suggestions[highlightIdx]) {
        addTag(suggestions[highlightIdx])
      } else if (input.trim()) {
        addTagByName(input)
      }
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      const lastTag = value[value.length - 1]
      if (!lastTag.deleted || lastTag.deleted === 0) {
        removeTag(lastTag)
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setShowDropdown(true)
      setHighlightIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
      setHighlightIdx(-1)
    } else if (e.key === 'Tab' && highlightIdx >= 0 && suggestions[highlightIdx]) {
      e.preventDefault()
      addTag(suggestions[highlightIdx])
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', ...style }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid #d1d5db',
          minHeight: 42,
          background: '#fff',
          alignItems: 'center',
          cursor: 'text'
        }}
        onClick={() => containerRef.current?.querySelector('input')?.focus()}
        onFocus={() => setShowDropdown(true)}
      >
        {value.map(tag => (
          <TagBadge
            key={tag.id || tag.name}
            tag={tag}
            onRemove={removeTag}
            size="sm"
          />
        ))}
        <input
          type="text"
          value={input}
          onChange={e => {
            setInput(e.target.value)
            setShowDropdown(true)
            setHighlightIdx(-1)
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowDropdown(true)}
          placeholder={value.length === 0 ? placeholder : ''}
          style={{
            border: 'none',
            outline: 'none',
            flex: 1,
            minWidth: 120,
            fontSize: 14,
            padding: '2px 4px',
            background: 'transparent'
          }}
        />
      </div>

      {showDropdown && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 4,
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          zIndex: 100,
          maxHeight: 240,
          overflowY: 'auto'
        }}>
          {suggestions.length === 0 && input.trim() && (
            <div style={{ padding: '10px 14px', fontSize: 13, color: '#6b7280' }}>
              未找到匹配标签，按 <kbd style={{
                padding: '1px 6px', background: '#f3f4f6', borderRadius: 4, fontSize: 11
              }}>Enter</kbd> 创建「{input.trim()}」
            </div>
          )}
          {suggestions.map((tag, idx) => (
            <div
              key={tag.id}
              onClick={() => addTag(tag)}
              onMouseEnter={() => setHighlightIdx(idx)}
              style={{
                padding: '8px 14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: idx === highlightIdx ? '#f3f4f6' : 'transparent',
                fontSize: 13
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: tag.color
              }} />
              <span style={{ color: '#1f2937', fontWeight: 500 }}>{tag.name}</span>
              {tag.usage_count !== undefined && tag.usage_count > 0 && (
                <span style={{ fontSize: 11, color: '#9ca3af' }}>· {tag.usage_count}次</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default TagInput
