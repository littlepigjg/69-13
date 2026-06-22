const DEFAULT_TAG_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
  '#06b6d4', '#64748b'
];

function pickTagColor(index) {
  return DEFAULT_TAG_COLORS[index % DEFAULT_TAG_COLORS.length];
}

function createTagStorage({ query, queryOne, run, saveDB }) {
  const tags = {
    getAll: async (includeDeleted = false) => {
      if (includeDeleted) {
        return query('SELECT * FROM tags ORDER BY name');
      }
      return query('SELECT * FROM tags WHERE deleted = 0 ORDER BY name');
    },
    getById: async (id) => queryOne('SELECT * FROM tags WHERE id = ? AND deleted = 0', [id]),
    getByIdIncludingDeleted: async (id) => queryOne('SELECT * FROM tags WHERE id = ?', [id]),
    getByName: async (name) => queryOne('SELECT * FROM tags WHERE name = ? AND deleted = 0', [name]),
    getByNameIncludingDeleted: async (name) => queryOne('SELECT * FROM tags WHERE name = ?', [name]),
    search: async (keyword, limit = 20) => {
      if (!keyword) return [];
      return query(
        'SELECT * FROM tags WHERE deleted = 0 AND name LIKE ? ORDER BY name LIMIT ?',
        [`%${keyword}%`, limit]
      );
    },
    getPopular: async (limit = 10) => {
      return query(`
        SELECT t.*, COUNT(crt.id) as usage_count
        FROM tags t
        LEFT JOIN check_result_tags crt ON crt.tag_id = t.id
        WHERE t.deleted = 0
        GROUP BY t.id
        ORDER BY usage_count DESC, t.name ASC
        LIMIT ?
      `, [limit]);
    },
    create: async (data) => {
      const existing = await queryOne('SELECT * FROM tags WHERE name = ?', [data.name]);
      if (existing) {
        if (existing.deleted) {
          run('UPDATE tags SET deleted = 0, deleted_at = NULL, color = ? WHERE id = ?', [
            data.color || existing.color || pickTagColor(0), existing.id
          ]);
          saveDB();
          return queryOne('SELECT * FROM tags WHERE id = ?', [existing.id]);
        }
        return existing;
      }
      const existingCount = query('SELECT COUNT(*) as cnt FROM tags')[0]?.cnt || 0;
      const payload = {
        color: data.color || pickTagColor(existingCount),
        ...data
      };
      const res = run(
        'INSERT INTO tags (name, color) VALUES (?, ?)',
        [payload.name, payload.color]
      );
      saveDB();
      return queryOne('SELECT * FROM tags WHERE id = ?', [res.lastID]);
    },
    update: async (id, data) => {
      const keys = Object.keys(data).filter(k =>
        k !== 'id' && k !== 'created_at' && k !== 'deleted' && k !== 'deleted_at'
      );
      if (keys.length === 0) return queryOne('SELECT * FROM tags WHERE id = ?', [id]);
      const sets = keys.map(k => `${k} = ?`).join(', ');
      const values = keys.map(k => data[k]);
      run(`UPDATE tags SET ${sets} WHERE id = ?`, [...values, id]);
      saveDB();
      return queryOne('SELECT * FROM tags WHERE id = ?', [id]);
    },
    remove: async (id) => {
      run('UPDATE tags SET deleted = 1, deleted_at = ? WHERE id = ?', [new Date().toISOString(), id]);
      saveDB();
      return { changes: 1 };
    },
    restore: async (id) => {
      run('UPDATE tags SET deleted = 0, deleted_at = NULL WHERE id = ?', [id]);
      saveDB();
      return queryOne('SELECT * FROM tags WHERE id = ?', [id]);
    },
    getStats: async (tagId) => {
      const tag = await queryOne('SELECT * FROM tags WHERE id = ?', [tagId]);
      if (!tag) return null;
      const usageCount = queryOne(`
        SELECT COUNT(*) as cnt FROM check_result_tags WHERE tag_id = ?
      `, [tagId])?.cnt || 0;
      const affectedResults = query(`
        SELECT cr.*, s.name as service_name
        FROM check_results cr
        JOIN check_result_tags crt ON crt.check_result_id = cr.id
        LEFT JOIN services s ON s.id = cr.service_id
        WHERE crt.tag_id = ?
        ORDER BY cr.timestamp DESC
        LIMIT 100
      `, [tagId]);
      return { tag, usageCount, recentResults: affectedResults };
    }
  };

  const checkResultTags = {
    getByResultId: async (resultId) => {
      return query(`
        SELECT t.* FROM tags t
        JOIN check_result_tags crt ON crt.tag_id = t.id
        WHERE crt.check_result_id = ?
        ORDER BY t.deleted ASC, t.name ASC
      `, [resultId]);
    },
    getByResultIds: async (resultIds) => {
      if (!resultIds || resultIds.length === 0) return {};
      const placeholders = resultIds.map(() => '?').join(',');
      const rows = query(`
        SELECT crt.check_result_id, t.* FROM tags t
        JOIN check_result_tags crt ON crt.tag_id = t.id
        WHERE crt.check_result_id IN (${placeholders})
        ORDER BY t.deleted ASC, t.name ASC
      `, resultIds);
      const map = {};
      for (const row of rows) {
        const rid = row.check_result_id;
        if (!map[rid]) map[rid] = [];
        map[rid].push({
          id: row.id,
          name: row.name,
          color: row.color,
          created_at: row.created_at,
          deleted: row.deleted || 0,
          deleted_at: row.deleted_at
        });
      }
      return map;
    },
    setTags: async (resultId, tagNames) => {
      run('DELETE FROM check_result_tags WHERE check_result_id = ?', [resultId]);
      const normalized = [...new Set(tagNames.map(n => n.trim()).filter(n => n))];
      for (const name of normalized) {
        let tag = await tags.getByName(name);
        if (!tag) {
          const existingDeleted = await tags.getByNameIncludingDeleted(name);
          if (existingDeleted) {
            tag = await tags.restore(existingDeleted.id);
          } else {
            tag = await tags.create({ name });
          }
        }
        try {
          run(
            'INSERT OR IGNORE INTO check_result_tags (check_result_id, tag_id) VALUES (?, ?)',
            [resultId, tag.id]
          );
        } catch (e) {}
      }
      saveDB();
      return checkResultTags.getByResultId(resultId);
    },
    addTag: async (resultId, tagName) => {
      let tag = await tags.getByName(tagName.trim());
      if (!tag) {
        const existingDeleted = await tags.getByNameIncludingDeleted(tagName.trim());
        if (existingDeleted) {
          tag = await tags.restore(existingDeleted.id);
        } else {
          tag = await tags.create({ name: tagName.trim() });
        }
      }
      try {
        run(
          'INSERT OR IGNORE INTO check_result_tags (check_result_id, tag_id) VALUES (?, ?)',
          [resultId, tag.id]
        );
      } catch (e) {}
      saveDB();
      return checkResultTags.getByResultId(resultId);
    },
    removeTag: async (resultId, tagId) => {
      run('DELETE FROM check_result_tags WHERE check_result_id = ? AND tag_id = ?', [resultId, tagId]);
      saveDB();
      return checkResultTags.getByResultId(resultId);
    },
    filterByTags: async ({ tagIds, serviceId, from, to, limit = 500 }) => {
      const params = [];
      const where = [];
      if (tagIds && tagIds.length > 0) {
        where.push(`cr.id IN (
          SELECT DISTINCT check_result_id FROM check_result_tags
          WHERE tag_id IN (${tagIds.map(() => '?').join(',')})
        )`);
        params.push(...tagIds);
      }
      if (serviceId) {
        where.push('cr.service_id = ?');
        params.push(serviceId);
      }
      if (from) {
        where.push('cr.timestamp >= ?');
        params.push(from);
      }
      if (to) {
        where.push('cr.timestamp <= ?');
        params.push(to);
      }
      const whereSql = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
      return query(`
        SELECT cr.*, s.name as service_name FROM check_results cr
        LEFT JOIN services s ON s.id = cr.service_id
        ${whereSql}
        ORDER BY cr.timestamp DESC
        LIMIT ?
      `, [...params, limit]);
    },
    getResultTagsMap: async (results) => {
      const resultIds = results.map(r => r.id);
      if (resultIds.length === 0) return {};
      return checkResultTags.getByResultIds(resultIds);
    },
    enrichResultsWithTags: async (results) => {
      const tagsMap = await checkResultTags.getResultTagsMap(results);
      return results.map(r => ({ ...r, tags: tagsMap[r.id] || [] }));
    }
  };

  function initTables(db) {
    db.run(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT DEFAULT '#6366f1',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        deleted INTEGER DEFAULT 0,
        deleted_at TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS check_result_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        check_result_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(check_result_id, tag_id)
      )
    `);
  }

  function initIndexes(db) {
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_result_tags_result ON check_result_tags(check_result_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_result_tags_tag ON check_result_tags(tag_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)');
    } catch (e) {}
  }

  return {
    tags,
    checkResultTags,
    initTables,
    initIndexes,
    DEFAULT_TAG_COLORS,
    pickTagColor
  };
}

module.exports = createTagStorage;
