import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { TagBadge, TagBadgeList } from '../src/components/tags/TagBadge.jsx'

describe('TagBadge 组件测试', () => {
  const normalTag = { id: 1, name: '网络抖动', color: '#ef4444', deleted: 0 }
  const deletedTag = { id: 2, name: '旧标签', color: '#6366f1', deleted: 1, deleted_at: '2026-06-22T00:00:00Z' }

  it('正常标签正确渲染', () => {
    render(<TagBadge tag={normalTag} />)
    const badge = screen.getByText('网络抖动')
    expect(badge).toBeInTheDocument()
    expect(badge).not.toHaveStyle({ textDecoration: 'line-through' })
  })

  it('已删除标签显示删除线和斜体', () => {
    render(<TagBadge tag={deletedTag} />)
    const badgeText = screen.getByText('旧标签')
    expect(badgeText).toHaveStyle({ textDecoration: 'line-through' })
    expect(badgeText).toHaveStyle({ fontStyle: 'italic' })
  })

  it('已删除标签显示灰色', () => {
    const { container } = render(<TagBadge tag={deletedTag} />)
    const badge = container.firstChild
    expect(badge).toHaveStyle({ color: '#9ca3af' })
    expect(badge).toHaveStyle({ background: 'rgba(156, 163, 175, 0.12)' })
  })

  it('已删除标签有正确的 tooltip 提示', () => {
    const { container } = render(<TagBadge tag={deletedTag} />)
    const badge = container.firstChild
    expect(badge).toHaveAttribute('title', '该标签已删除（历史记录保留）')
  })

  it('✅ 核心修复：已删除标签也显示移除按钮', () => {
    const onRemove = vi.fn()
    render(<TagBadge tag={deletedTag} onRemove={onRemove} />)

    const removeBtn = screen.getByRole('button', { name: '×' })
    expect(removeBtn).toBeInTheDocument()
  })

  it('✅ 核心修复：点击已删除标签的移除按钮触发回调', () => {
    const onRemove = vi.fn()
    render(<TagBadge tag={deletedTag} onRemove={onRemove} />)

    const removeBtn = screen.getByRole('button', { name: '×' })
    fireEvent.click(removeBtn)
    expect(onRemove).toHaveBeenCalledWith(deletedTag)
  })

  it('✅ 核心修复：已删除标签移除按钮有正确的 tooltip', () => {
    const onRemove = vi.fn()
    render(<TagBadge tag={deletedTag} onRemove={onRemove} />)

    const removeBtn = screen.getByRole('button', { name: '×' })
    expect(removeBtn).toHaveAttribute('title', '移除与该已删除标签的关联')
  })

  it('正常标签也可以移除', () => {
    const onRemove = vi.fn()
    render(<TagBadge tag={normalTag} onRemove={onRemove} />)

    const removeBtn = screen.getByRole('button', { name: '×' })
    fireEvent.click(removeBtn)
    expect(onRemove).toHaveBeenCalledWith(normalTag)
  })

  it('没有 onRemove 时不显示移除按钮', () => {
    render(<TagBadge tag={normalTag} />)
    const buttons = screen.queryAllByRole('button')
    expect(buttons.length).toBe(0)
  })

  it('TagBadgeList 正确渲染多个标签', () => {
    const onRemove = vi.fn()
    render(<TagBadgeList tags={[normalTag, deletedTag]} onRemoveTag={onRemove} />)

    expect(screen.getByText('网络抖动')).toBeInTheDocument()
    expect(screen.getByText('旧标签')).toBeInTheDocument()

    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBe(2)
  })

  it('空标签不渲染', () => {
    const { container } = render(<TagBadgeList tags={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('null 标签不渲染', () => {
    const { container } = render(<TagBadge tag={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('不同尺寸正确渲染', () => {
    const { rerender } = render(<TagBadge tag={normalTag} size="sm" />)
    expect(screen.getByText('网络抖动')).toBeInTheDocument()

    rerender(<TagBadge tag={normalTag} size="lg" />)
    expect(screen.getByText('网络抖动')).toBeInTheDocument()
  })

  it('showDeleted=false 时已删除标签按正常样式显示', () => {
    render(<TagBadge tag={deletedTag} showDeleted={false} />)
    const badgeText = screen.getByText('旧标签')
    expect(badgeText).not.toHaveStyle({ textDecoration: 'line-through' })
  })

  it('点击移除按钮时事件不冒泡', () => {
    const onRemove = vi.fn()
    const onClick = vi.fn()
    render(
      <div onClick={onClick}>
        <TagBadge tag={deletedTag} onRemove={onRemove} />
      </div>
    )

    const removeBtn = screen.getByRole('button', { name: '×' })
    fireEvent.click(removeBtn)

    expect(onRemove).toHaveBeenCalled()
    expect(onClick).not.toHaveBeenCalled()
  })
})
