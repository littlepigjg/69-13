import { describe, it, expect } from 'vitest'
import {
  isTagDeleted,
  hexToRgba,
  pickTagColor,
  DEFAULT_TAG_COLORS,
  normalizeTags,
  parseTagNames,
  groupTagsByUsage,
  getTagDisplayName
} from '../src/components/tags/tagUtils.js'

describe('tagUtils - 标签工具函数测试', () => {
  describe('isTagDeleted', () => {
    it('正常标签返回 false', () => {
      expect(isTagDeleted({ id: 1, name: 'test', deleted: 0 })).toBe(false)
      expect(isTagDeleted({ id: 1, name: 'test', deleted: null })).toBe(false)
      expect(isTagDeleted({ id: 1, name: 'test' })).toBe(false)
    })

    it('已删除标签返回 true', () => {
      expect(isTagDeleted({ id: 1, name: 'test', deleted: 1 })).toBe(true)
      expect(isTagDeleted({ id: 1, name: 'test', deleted: 2 })).toBe(true)
    })
  })

  describe('hexToRgba', () => {
    it('正确转换 hex 颜色到 rgba', () => {
      expect(hexToRgba('#ff0000', 0.5)).toBe('rgba(255,0,0,0.5)')
      expect(hexToRgba('#00ff00', 1)).toBe('rgba(0,255,0,1)')
      expect(hexToRgba('#0000ff', 0)).toBe('rgba(0,0,255,0)')
    })
  })

  describe('pickTagColor', () => {
    it('按索引循环返回颜色', () => {
      expect(pickTagColor(0)).toBe(DEFAULT_TAG_COLORS[0])
      expect(pickTagColor(11)).toBe(DEFAULT_TAG_COLORS[11])
      expect(pickTagColor(12)).toBe(DEFAULT_TAG_COLORS[0])
      expect(pickTagColor(13)).toBe(DEFAULT_TAG_COLORS[1])
    })
  })

  describe('normalizeTags', () => {
    it('去重标签', () => {
      const tags = [
        { id: 1, name: '网络抖动' },
        { id: 1, name: '网络抖动' },
        { id: 2, name: '部署中' }
      ]
      const result = normalizeTags(tags)
      expect(result.length).toBe(2)
    })

    it('处理没有 id 的新标签', () => {
      const tags = [
        { name: '网络抖动', _new: true },
        { name: '网络抖动', _new: true },
        { name: '部署中', _new: true }
      ]
      const result = normalizeTags(tags)
      expect(result.length).toBe(2)
    })

    it('空输入返回空数组', () => {
      expect(normalizeTags(null)).toEqual([])
      expect(normalizeTags([])).toEqual([])
      expect(normalizeTags(undefined)).toEqual([])
    })
  })

  describe('parseTagNames', () => {
    it('按逗号、空格分隔标签名', () => {
      expect(parseTagNames('网络抖动,部署中 第三方故障')).toEqual([
        '网络抖动', '部署中', '第三方故障'
      ])
    })

    it('处理中文逗号', () => {
      expect(parseTagNames('网络抖动，部署中')).toEqual(['网络抖动', '部署中'])
    })

    it('空输入返回空数组', () => {
      expect(parseTagNames('')).toEqual([])
      expect(parseTagNames(null)).toEqual([])
      expect(parseTagNames(undefined)).toEqual([])
    })

    it('过滤空字符串', () => {
      expect(parseTagNames(',,网络抖动,,部署中  ')).toEqual(['网络抖动', '部署中'])
    })
  })

  describe('groupTagsByUsage', () => {
    it('按使用次数降序排序', () => {
      const tags = [
        { id: 1, name: '网络抖动', usage_count: 5 },
        { id: 2, name: '部署中', usage_count: 10 },
        { id: 3, name: '第三方故障', usage_count: 3 }
      ]
      const result = groupTagsByUsage(tags)
      expect(result[0].name).toBe('部署中')
      expect(result[1].name).toBe('网络抖动')
      expect(result[2].name).toBe('第三方故障')
    })

    it('空输入返回空数组', () => {
      expect(groupTagsByUsage([])).toEqual([])
      expect(groupTagsByUsage(null)).toEqual([])
    })
  })

  describe('getTagDisplayName', () => {
    it('正确返回标签名', () => {
      expect(getTagDisplayName({ name: '网络抖动' })).toBe('网络抖动')
      expect(getTagDisplayName({ id: 1, name: '部署中' })).toBe('部署中')
    })

    it('空输入返回空字符串', () => {
      expect(getTagDisplayName(null)).toBe('')
      expect(getTagDisplayName(undefined)).toBe('')
      expect(getTagDisplayName({})).toBe('')
    })
  })
})
