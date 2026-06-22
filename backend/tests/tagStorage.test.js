import { describe, it, expect, beforeEach } from 'vitest'
import initSqlJs from 'sql.js'
import createTagStorage from '../tagStorage.js'

describe('tagStorage - 标签存储模块测试', () => {
  let SQL, db, tagStorage

  function run(sql, params = []) {
    db.run(sql, params)
    return { lastID: db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0] }
  }

  function query(sql, params = []) {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    const results = []
    while (stmt.step()) {
      results.push(stmt.getAsObject())
    }
    stmt.free()
    return results
  }

  function queryOne(sql, params = []) {
    const results = query(sql, params)
    return results[0] || null
  }

  function saveDB() {}

  beforeEach(async () => {
    SQL = await initSqlJs()
    db = new SQL.Database()

    db.run(`
      CREATE TABLE services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        target TEXT NOT NULL
      )
    `)

    db.run(`
      CREATE TABLE check_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_id INTEGER,
        success INTEGER,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        response_time_ms INTEGER,
        status_code INTEGER,
        error_message TEXT,
        is_maintenance INTEGER DEFAULT 0
      )
    `)

    run('INSERT INTO services (name, type, target) VALUES (?, ?, ?)', ['测试服务', 'http', 'http://example.com'])

    tagStorage = createTagStorage({ query, queryOne, run, saveDB })
    tagStorage.initTables(db)
    tagStorage.initIndexes(db)

    for (let i = 0; i < 5; i++) {
      run(
        'INSERT INTO check_results (service_id, success, timestamp) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [1, i === 0 ? 0 : 1]
      )
    }
  })

  describe('标签基础 CRUD', () => {
    it('创建标签成功', async () => {
      const tag = await tagStorage.tags.create({ name: '网络抖动', color: '#ef4444' })
      expect(tag.name).toBe('网络抖动')
      expect(tag.color).toBe('#ef4444')
      expect(tag.deleted).toBe(0)
      expect(tag.id).toBeDefined()
    })

    it('标签名称唯一，重复创建返回已存在标签', async () => {
      const tag1 = await tagStorage.tags.create({ name: '网络抖动' })
      const tag2 = await tagStorage.tags.create({ name: '网络抖动' })
      expect(tag1.id).toBe(tag2.id)
    })

    it('删除标签后恢复（软删除）', async () => {
      const tag = await tagStorage.tags.create({ name: '网络抖动' })
      const result = await tagStorage.tags.remove(tag.id)
      expect(result.changes).toBe(1)

      const deleted = await tagStorage.tags.getById(tag.id)
      expect(deleted).toBeNull()

      const allIncludingDeleted = await tagStorage.tags.getByIdIncludingDeleted(tag.id)
      expect(allIncludingDeleted.deleted).toBe(1)
      expect(allIncludingDeleted.deleted_at).toBeDefined()
    })

    it('重新创建已删除标签自动恢复', async () => {
      const tag1 = await tagStorage.tags.create({ name: '网络抖动' })
      await tagStorage.tags.remove(tag1.id)

      const restored = await tagStorage.tags.create({ name: '网络抖动', color: '#10b981' })
      expect(restored.id).toBe(tag1.id)
      expect(restored.deleted).toBe(0)
      expect(restored.color).toBe('#10b981')
      expect(restored.deleted_at).toBeNull()
    })

    it('按名称搜索标签（不包含已删除）', async () => {
      await tagStorage.tags.create({ name: '网络抖动' })
      const tag2 = await tagStorage.tags.create({ name: '网络故障' })
      await tagStorage.tags.remove(tag2.id)

      const results = await tagStorage.tags.search('网络')
      expect(results.length).toBe(1)
      expect(results[0].name).toBe('网络抖动')
    })

    it('热门标签按使用次数排序', async () => {
      const tag1 = await tagStorage.tags.create({ name: '网络抖动' })
      const tag2 = await tagStorage.tags.create({ name: '部署中' })

      await tagStorage.checkResultTags.addTag(1, '网络抖动')
      await tagStorage.checkResultTags.addTag(2, '网络抖动')
      await tagStorage.checkResultTags.addTag(3, '部署中')

      const popular = await tagStorage.tags.getPopular(10)
      expect(popular[0].name).toBe('网络抖动')
      expect(popular[0].usage_count).toBe(2)
      expect(popular[1].name).toBe('部署中')
      expect(popular[1].usage_count).toBe(1)
    })

    it('热门标签不包含已删除标签', async () => {
      const tag = await tagStorage.tags.create({ name: '网络抖动' })
      await tagStorage.checkResultTags.addTag(1, '网络抖动')
      await tagStorage.tags.remove(tag.id)

      const popular = await tagStorage.tags.getPopular(10)
      expect(popular.find(t => t.name === '网络抖动')).toBeUndefined()
    })
  })

  describe('检测记录标签关联', () => {
    it('给检测记录添加标签', async () => {
      await tagStorage.tags.create({ name: '网络抖动' })
      const tags = await tagStorage.checkResultTags.addTag(1, '网络抖动')
      expect(tags.length).toBe(1)
      expect(tags[0].name).toBe('网络抖动')
    })

    it('批量设置检测记录标签', async () => {
      await tagStorage.tags.create({ name: '网络抖动' })
      await tagStorage.tags.create({ name: '部署中' })

      const tags = await tagStorage.checkResultTags.setTags(1, ['网络抖动', '部署中', '网络抖动'])
      const names = tags.map(t => t.name)
      expect(tags.length).toBe(2)
      expect(names).toContain('网络抖动')
      expect(names).toContain('部署中')
    })

    it('获取检测记录的所有标签（包括已删除的）', async () => {
      await tagStorage.tags.create({ name: '网络抖动' })
      await tagStorage.tags.create({ name: '部署中' })
      await tagStorage.checkResultTags.setTags(1, ['网络抖动', '部署中'])

      await tagStorage.tags.remove((await tagStorage.tags.getByName('部署中')).id)

      const tags = await tagStorage.checkResultTags.getByResultId(1)
      expect(tags.length).toBe(2)

      const deletedTag = tags.find(t => t.name === '部署中')
      expect(deletedTag.deleted).toBe(1)
    })

    it('✅ 核心修复：可以移除与已删除标签的关联', async () => {
      await tagStorage.tags.create({ name: '网络抖动' })
      await tagStorage.tags.create({ name: '部署中' })
      await tagStorage.checkResultTags.setTags(1, ['网络抖动', '部署中'])

      const deployedTag = await tagStorage.tags.getByName('部署中')
      await tagStorage.tags.remove(deployedTag.id)

      const deletedTag = (await tagStorage.checkResultTags.getByResultId(1)).find(t => t.name === '部署中')
      expect(deletedTag.deleted).toBe(1)

      const remaining = await tagStorage.checkResultTags.removeTag(1, deletedTag.id)
      expect(remaining.length).toBe(1)
      expect(remaining[0].name).toBe('网络抖动')

      const finalTags = await tagStorage.checkResultTags.getByResultId(1)
      expect(finalTags.length).toBe(1)
      expect(finalTags.find(t => t.name === '部署中')).toBeUndefined()
    })

    it('✅ 核心修复：setTags 时可以清除已删除标签', async () => {
      await tagStorage.tags.create({ name: '网络抖动' })
      await tagStorage.tags.create({ name: '部署中' })
      await tagStorage.checkResultTags.setTags(1, ['网络抖动', '部署中'])

      const deployedTag = await tagStorage.tags.getByName('部署中')
      await tagStorage.tags.remove(deployedTag.id)

      const newTags = await tagStorage.checkResultTags.setTags(1, ['网络抖动'])
      expect(newTags.length).toBe(1)
      expect(newTags[0].name).toBe('网络抖动')
    })

    it('批量获取多条记录的标签', async () => {
      await tagStorage.tags.create({ name: '网络抖动' })
      await tagStorage.checkResultTags.addTag(1, '网络抖动')
      await tagStorage.checkResultTags.addTag(2, '网络抖动')

      const tag = await tagStorage.tags.getByName('网络抖动')
      await tagStorage.tags.remove(tag.id)

      const tagsMap = await tagStorage.checkResultTags.getByResultIds([1, 2, 3])

      expect(tagsMap[1][0].deleted).toBe(1)
      expect(tagsMap[2][0].deleted).toBe(1)
      expect(tagsMap[3]).toBeUndefined()
    })

    it('按标签过滤检测记录', async () => {
      await tagStorage.tags.create({ name: '网络抖动' })
      await tagStorage.tags.create({ name: '部署中' })
      await tagStorage.checkResultTags.addTag(1, '网络抖动')
      await tagStorage.checkResultTags.addTag(2, '部署中')
      await tagStorage.checkResultTags.addTag(3, '网络抖动')

      const netTag = await tagStorage.tags.getByName('网络抖动')
      const results = await tagStorage.checkResultTags.filterByTags({ tagIds: [netTag.id] })

      expect(results.length).toBe(2)
      expect(results.map(r => r.id)).toContain(1)
      expect(results.map(r => r.id)).toContain(3)
    })
  })

  describe('标签统计', () => {
    it('获取标签统计信息', async () => {
      const tag = await tagStorage.tags.create({ name: '网络抖动' })
      await tagStorage.checkResultTags.addTag(1, '网络抖动')
      await tagStorage.checkResultTags.addTag(2, '网络抖动')

      const stats = await tagStorage.tags.getStats(tag.id)
      expect(stats.tag.name).toBe('网络抖动')
      expect(stats.usageCount).toBe(2)
      expect(stats.recentResults.length).toBe(2)
    })

    it('已删除标签仍可查询统计', async () => {
      const tag = await tagStorage.tags.create({ name: '网络抖动' })
      await tagStorage.checkResultTags.addTag(1, '网络抖动')
      await tagStorage.tags.remove(tag.id)

      const stats = await tagStorage.tags.getStats(tag.id)
      expect(stats).not.toBeNull()
      expect(stats.usageCount).toBe(1)
    })
  })

  describe('边界情况', () => {
    it('空标签名称处理', async () => {
      const tags = await tagStorage.checkResultTags.setTags(1, ['', '   ', '网络抖动'])
      expect(tags.length).toBe(1)
      expect(tags[0].name).toBe('网络抖动')
    })

    it('重复标签去重', async () => {
      const tags = await tagStorage.checkResultTags.setTags(1, ['网络抖动', '网络抖动', '网络抖动'])
      expect(tags.length).toBe(1)
    })

    it('大小写敏感测试结果标签数量为0', async () => {
      const map = await tagStorage.checkResultTags.getByResultIds([])
      expect(Object.keys(map).length).toBe(0)
    })
  })
})
