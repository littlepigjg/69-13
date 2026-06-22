const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const config = require('./config');

let db = null;
let SQL = null;
let dirty = false;

function saveDB() {
  if (!db || !dirty) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    const dbDir = path.dirname(config.dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    const tmpPath = config.dbPath + '.tmp';
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, config.dbPath);
    dirty = false;
  } catch (e) {
    console.error('[Storage] Save DB error:', e.message);
  }
}

setInterval(saveDB, 5000);

async function initDB() {
  SQL = await initSqlJs();

  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  if (fs.existsSync(config.dbPath)) {
    try {
      const buf = fs.readFileSync(config.dbPath);
      db = new SQL.Database(buf);
      console.log('[Storage] Loaded existing database');
    } catch (e) {
      console.warn('[Storage] Failed to load DB, creating new one:', e.message);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('http', 'https', 'tcp')),
      target TEXT NOT NULL,
      port INTEGER,
      method TEXT DEFAULT 'GET',
      expectedStatus INTEGER DEFAULT 200,
      interval_seconds INTEGER DEFAULT 30,
      timeout_ms INTEGER DEFAULT 5000,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  dirty = true;

  db.run(`
    CREATE TABLE IF NOT EXISTS check_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      success INTEGER NOT NULL,
      response_time_ms INTEGER,
      error_message TEXT,
      status_code INTEGER,
      is_maintenance INTEGER DEFAULT 0
    )
  `);
  dirty = true;

  db.run(`
    CREATE TABLE IF NOT EXISTS maintenance_windows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id INTEGER,
      name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      description TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  dirty = true;

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
  dirty = true;

  db.run(`
    CREATE TABLE IF NOT EXISTS check_result_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      check_result_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(check_result_id, tag_id)
    )
  `);
  dirty = true;

  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_results_service_time ON check_results(service_id, timestamp)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_maintenance_time ON maintenance_windows(start_time, end_time)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_result_tags_result ON check_result_tags(check_result_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_result_tags_tag ON check_result_tags(tag_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)');
    dirty = true;
  } catch (e) {}

  await cleanupOldData();
  saveDB();
}

async function cleanupOldData() {
  const cutoff = moment().subtract(config.dataRetentionDays, 'days').toISOString();
  db.run('DELETE FROM check_results WHERE timestamp < ?', [cutoff]);
  dirty = true;
  saveDB();
}

function appendLog(serviceId, result) {
  try {
    const logFile = path.join(config.logDir, `service-${serviceId}-${moment().format('YYYY-MM-DD')}.log`);
    const line = JSON.stringify({
      ts: result.timestamp,
      success: result.success ? 1 : 0,
      rt: result.response_time_ms,
      msg: result.error_message || '',
      status: result.status_code || '',
      maint: result.is_maintenance ? 1 : 0
    }) + '\n';
    fs.appendFileSync(logFile, line, 'utf8');
  } catch (e) {
    console.error('[Storage] Log append error:', e.message);
  }
}

function run(sql, params = []) {
  db.run(sql, params);
  dirty = true;
  return { lastID: db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0], changes: null };
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const rows = query(sql, params);
  return rows.length ? rows[0] : undefined;
}

const services = {
  getAll: async () => query('SELECT * FROM services ORDER BY name'),
  getById: async (id) => queryOne('SELECT * FROM services WHERE id = ?', [id]),
  create: async (data) => {
    const payload = {
      method: 'GET',
      expectedStatus: 200,
      interval_seconds: config.defaultCheckIntervalSeconds,
      timeout_ms: config.defaultTimeoutMs,
      enabled: 1,
      port: null,
      ...data
    };
    const res = run(
      `INSERT INTO services (name, type, target, port, method, expectedStatus, interval_seconds, timeout_ms, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [payload.name, payload.type, payload.target, payload.port, payload.method, payload.expectedStatus, payload.interval_seconds, payload.timeout_ms, payload.enabled]
    );
    saveDB();
    return queryOne('SELECT * FROM services WHERE id = ?', [res.lastID]);
  },
  update: async (id, data) => {
    const keys = Object.keys(data);
    if (keys.length === 0) return queryOne('SELECT * FROM services WHERE id = ?', [id]);
    const sets = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => data[k]);
    run(`UPDATE services SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...values, id]);
    saveDB();
    return queryOne('SELECT * FROM services WHERE id = ?', [id]);
  },
  remove: async (id) => {
    run('DELETE FROM services WHERE id = ?', [id]);
    run('DELETE FROM check_results WHERE service_id = ?', [id]);
    run('DELETE FROM maintenance_windows WHERE service_id = ?', [id]);
    saveDB();
    return { changes: 1 };
  }
};

const checkResults = {
  insert: async (result) => {
    const res = run(
      `INSERT INTO check_results (service_id, timestamp, success, response_time_ms, error_message, status_code, is_maintenance)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [result.service_id, result.timestamp, result.success, result.response_time_ms, result.error_message, result.status_code, result.is_maintenance]
    );
    appendLog(result.service_id, result);
    if (process.memoryUsage().heapUsed > 512 * 1024 * 1024) saveDB();
    return res;
  },
  getLatest: async (serviceId, limit = 1) =>
    query('SELECT * FROM check_results WHERE service_id = ? ORDER BY timestamp DESC LIMIT ?', [serviceId, limit]),
  getByTimeRange: async (serviceId, from, to) =>
    query('SELECT * FROM check_results WHERE service_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC', [serviceId, from, to])
};

const maintenance = {
  getAll: async (serviceId = null) => {
    if (serviceId !== null && serviceId !== undefined) {
      return query('SELECT * FROM maintenance_windows WHERE service_id = ? ORDER BY start_time DESC', [serviceId]);
    }
    return query('SELECT * FROM maintenance_windows ORDER BY start_time DESC');
  },
  getActive: async (serviceId, time = new Date().toISOString()) =>
    query(`SELECT * FROM maintenance_windows WHERE (service_id = ? OR service_id IS NULL)
           AND active = 1 AND start_time <= ? AND end_time >= ?`, [serviceId, time, time]),
  create: async (data) => {
    const payload = { active: 1, description: '', service_id: null, ...data };
    const res = run(
      `INSERT INTO maintenance_windows (service_id, name, start_time, end_time, description, active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [payload.service_id, payload.name, payload.start_time, payload.end_time, payload.description, payload.active]
    );
    saveDB();
    return queryOne('SELECT * FROM maintenance_windows WHERE id = ?', [res.lastID]);
  },
  update: async (id, data) => {
    const keys = Object.keys(data);
    if (keys.length === 0) return queryOne('SELECT * FROM maintenance_windows WHERE id = ?', [id]);
    const sets = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => data[k]);
    run(`UPDATE maintenance_windows SET ${sets} WHERE id = ?`, [...values, id]);
    saveDB();
    return queryOne('SELECT * FROM maintenance_windows WHERE id = ?', [id]);
  },
  remove: async (id) => {
    run('DELETE FROM maintenance_windows WHERE id = ?', [id]);
    saveDB();
    return { changes: 1 };
  }
};

const DEFAULT_TAG_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
  '#06b6d4', '#64748b'
];

function pickTagColor(index) {
  return DEFAULT_TAG_COLORS[index % DEFAULT_TAG_COLORS.length];
}

const tags = {
  getAll: async (includeDeleted = false) => {
    if (includeDeleted) {
      return query('SELECT * FROM tags ORDER BY name');
    }
    return query('SELECT * FROM tags WHERE deleted = 0 ORDER BY name');
  },
  getById: async (id) => queryOne('SELECT * FROM tags WHERE id = ? AND deleted = 0', [id]),
  getByName: async (name) => queryOne('SELECT * FROM tags WHERE name = ? AND deleted = 0', [name]),
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
        await run('UPDATE tags SET deleted = 0, deleted_at = NULL, color = ? WHERE id = ?', [
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
    const keys = Object.keys(data).filter(k => k !== 'id' && k !== 'created_at' && k !== 'deleted' && k !== 'deleted_at');
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
      WHERE crt.check_result_id = ? AND t.deleted = 0
      ORDER BY t.name
    `, [resultId]);
  },
  getByResultIds: async (resultIds) => {
    if (!resultIds || resultIds.length === 0) return {};
    const placeholders = resultIds.map(() => '?').join(',');
    const rows = query(`
      SELECT crt.check_result_id, t.* FROM tags t
      JOIN check_result_tags crt ON crt.tag_id = t.id
      WHERE crt.check_result_id IN (${placeholders}) AND t.deleted = 0
      ORDER BY t.name
    `, resultIds);
    const map = {};
    for (const row of rows) {
      const rid = row.check_result_id;
      if (!map[rid]) map[rid] = [];
      map[rid].push({ id: row.id, name: row.name, color: row.color, created_at: row.created_at });
    }
    return map;
  },
  setTags: async (resultId, tagNames) => {
    run('DELETE FROM check_result_tags WHERE check_result_id = ?', [resultId]);
    const normalized = [...new Set(tagNames.map(n => n.trim()).filter(n => n))];
    for (const name of normalized) {
      let tag = await tags.getByName(name);
      if (!tag) {
        tag = await tags.create({ name });
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
      tag = await tags.create({ name: tagName.trim() });
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
  }
};

process.on('beforeExit', saveDB);
process.on('SIGINT', () => { saveDB(); process.exit(0); });
process.on('SIGTERM', () => { saveDB(); process.exit(0); });

module.exports = {
  initDB,
  cleanupOldData,
  services,
  checkResults,
  maintenance,
  tags,
  checkResultTags
};
