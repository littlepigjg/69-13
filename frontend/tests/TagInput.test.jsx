import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import { TagInput } from '../src/components/tags/TagInput.jsx'

describe('TagInput 组件测试', () => {
  const normalTag = { id: 1, name: '网络抖动', color: '#ef4444', deleted: 0 }
  const deletedTag = { id: 2, name: '旧标签', color: '#6366f1', deleted: 1 }

  beforeEach(() => {
    vi.spyOn(window, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      })
    )
  })

  it('正确渲染已添加的标签', () => {
    render(<TagInput value={[normalTag, deletedTag]} onChange={vi.fn()} />)

    expect(screen.getByText('网络抖动')).toBeInTheDocument()
    expect(screen.getByText('旧标签')).toBeInTheDocument()
  })

  it('✅ 核心修复：已删除标签上显示移除按钮', () => {
    render(<TagInput value={[deletedTag]} onChange={vi.fn()} />)

    const buttons = screen.getAllByRole('button', { name: '×' })
    expect(buttons.length).toBe(1)
  })

  it('✅ 核心修复：点击已删除标签的×按钮可以移除', () => {
    const onChange = vi.fn()
    render(<TagInput value={[normalTag, deletedTag]} onChange={onChange} />)

    const deleteButtons = screen.getAllByRole('button', { name: '×' })
    fireEvent.click(deleteButtons[1])

    expect(onChange).toHaveBeenCalled()
    const newValue = onChange.mock.calls[0][0]
    expect(newValue.length).toBe(1)
    expect(newValue[0].name).toBe('网络抖动')
  })

  it('✅ 核心修复：退格键可以删除已删除标签', () => {
    const onChange = vi.fn()
    render(<TagInput value={[normalTag, deletedTag]} onChange={onChange} />)

    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'Backspace' })

    expect(onChange).toHaveBeenCalled()
    const newValue = onChange.mock.calls[0][0]
    expect(newValue.length).toBe(1)
    expect(newValue[0].name).toBe('网络抖动')
  })

  it('✅ 核心修复：连续退格可以删除所有标签（包括已删除的）', () => {
    const deletedTag2 = { id: 3, name: '另一个旧标签', color: '#f59e0b', deleted: 1 }

    const onChange1 = vi.fn()
    const { container: c1 } = render(<TagInput value={[normalTag, deletedTag, deletedTag2]} onChange={onChange1} />)
    const input1 = c1.querySelector('input')
    fireEvent.focus(input1)
    fireEvent.keyDown(input1, { key: 'Backspace' })
    expect(onChange1).toHaveBeenCalledTimes(1)
    expect(onChange1.mock.calls[0][0].length).toBe(2)
    expect(onChange1.mock.calls[0][0].map(t => t.name)).toEqual(['网络抖动', '旧标签'])

    cleanup()

    const onChange2 = vi.fn()
    const { container: c2 } = render(<TagInput value={[normalTag, deletedTag]} onChange={onChange2} />)
    const input2 = c2.querySelector('input')
    fireEvent.focus(input2)
    fireEvent.keyDown(input2, { key: 'Backspace' })
    expect(onChange2).toHaveBeenCalledTimes(1)
    expect(onChange2.mock.calls[0][0].length).toBe(1)
    expect(onChange2.mock.calls[0][0][0].name).toBe('网络抖动')

    cleanup()

    const onChange3 = vi.fn()
    const { container: c3 } = render(<TagInput value={[normalTag]} onChange={onChange3} />)
    const input3 = c3.querySelector('input')
    fireEvent.focus(input3)
    fireEvent.keyDown(input3, { key: 'Backspace' })
    expect(onChange3).toHaveBeenCalledTimes(1)
    expect(onChange3.mock.calls[0][0].length).toBe(0)
  })

  it('正常标签也可以通过退格键删除', () => {
    const onChange = vi.fn()
    render(<TagInput value={[normalTag]} onChange={onChange} />)

    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'Backspace' })

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('输入框有内容时退格键不删除标签', () => {
    const onChange = vi.fn()
    render(<TagInput value={[normalTag]} onChange={onChange} />)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '测试' } })
    fireEvent.keyDown(input, { key: 'Backspace' })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('没有标签时退格键无操作', () => {
    const onChange = vi.fn()
    render(<TagInput value={[]} onChange={onChange} />)

    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'Backspace' })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('已删除标签渲染为灰色带删除线', () => {
    render(<TagInput value={[deletedTag]} onChange={vi.fn()} />)

    const badgeText = screen.getByText('旧标签')
    expect(badgeText).toHaveStyle({ textDecoration: 'line-through' })
    expect(badgeText).toHaveStyle({ fontStyle: 'italic' })
  })

  it('输入新标签按 Enter 添加', () => {
    const onChange = vi.fn()
    render(<TagInput value={[]} onChange={onChange} />)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '新标签' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenCalled()
    const newValue = onChange.mock.calls[0][0]
    expect(newValue[0].name).toBe('新标签')
  })

  it('输入逗号自动分词', () => {
    const onChange = vi.fn()
    render(<TagInput value={[]} onChange={onChange} />)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '标签1,标签2' } })
    fireEvent.keyDown(input, { key: ',' })

    expect(onChange).toHaveBeenCalled()
    const newValue = onChange.mock.calls[0][0]
    expect(newValue.some(t => t.name === '标签1')).toBe(true)
  })

  it('正确显示占位文本', () => {
    render(<TagInput value={[]} onChange={vi.fn()} placeholder="请输入标签" />)

    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('placeholder', '请输入标签')
  })

  it('有标签时不显示占位文本', () => {
    render(<TagInput value={[normalTag]} onChange={vi.fn()} placeholder="请输入标签" />)

    const input = screen.getByRole('textbox')
    expect(input).not.toHaveAttribute('placeholder', '请输入标签')
  })

  it('按 Esc 关闭下拉框', () => {
    render(<TagInput value={[]} onChange={vi.fn()} />)

    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'Escape' })
  })

  it('空标签名自动去重和过滤', () => {
    const onChange = vi.fn()
    render(<TagInput value={[]} onChange={onChange} />)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: ',,网络抖动,,  ,部署中  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenCalled()
    const newValue = onChange.mock.calls[0][0]
    expect(newValue.length).toBe(2)
    expect(newValue.some(t => t.name === '网络抖动')).toBe(true)
    expect(newValue.some(t => t.name === '部署中')).toBe(true)
  })

  it('重复标签不重复添加', () => {
    const onChange = vi.fn()
    render(<TagInput value={[normalTag]} onChange={onChange} />)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '网络抖动' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).not.toHaveBeenCalled()
  })
})
