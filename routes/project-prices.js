const express = require('express');
const router = express.Router();
const { db } = require('../database');

// 验证redeemed cookie的中间件
function checkRedeemedCookie(req, res, next) {
  if (req.cookies && req.cookies.redeemed === 'true') {
    next();
  } else {
    res.status(401).json({ error: '未授权访问' });
  }
}

// 获取筛选选项 GET /api/project-prices/options（PostgreSQL：单引号空串 + async/await）
router.get('/options', checkRedeemedCookie, async (req, res) => {
  // PostgreSQL 中字符串用单引号，空串为 ''
  const categoriesQuery = "SELECT DISTINCT category FROM project_prices WHERE category IS NOT NULL AND category != '' ORDER BY category";
  const projectsQuery = "SELECT DISTINCT project_name FROM project_prices WHERE project_name IS NOT NULL AND project_name != '' ORDER BY project_name";
  const mappingQuery = 'SELECT DISTINCT category, project_name FROM project_prices WHERE category IS NOT NULL AND project_name IS NOT NULL ORDER BY category, project_name';

  try {
    const categoriesRows = await db.all(categoriesQuery, []);
    const projectsRows = await db.all(projectsQuery, []);
    const mappings = await db.all(mappingQuery, []);

    const projectsByCategory = {};
    mappings.forEach(row => {
      if (!projectsByCategory[row.category]) {
        projectsByCategory[row.category] = [];
      }
      if (!projectsByCategory[row.category].includes(row.project_name)) {
        projectsByCategory[row.category].push(row.project_name);
      }
    });

    res.json({
      categories: (categoriesRows || []).map(c => c.category),
      projects: (projectsRows || []).map(p => p.project_name),
      projectsByCategory
    });
  } catch (err) {
    console.error('Error fetching options:', err.message);
    res.status(500).json({ error: '获取大类失败', detail: err.message });
  }
});

// 查询接口 GET /api/project-prices（PostgreSQL：$1,$2... 占位符 + async/await）
router.get('/', checkRedeemedCookie, async (req, res) => {
  const { category, project, search } = req.query;
  let query = 'SELECT * FROM project_prices WHERE 1=1';
  const params = [];
  let paramIndex = 0;

  if (category && category !== 'all') {
    paramIndex++;
    query += ` AND category = $${paramIndex}`;
    params.push(category);
  }
  if (project && project !== 'all') {
    paramIndex++;
    query += ` AND project_name = $${paramIndex}`;
    params.push(project);
  }
  if (search && (search || '').trim()) {
    const searchTerm = `%${(search || '').trim()}%`;
    paramIndex++;
    query += ` AND (spec ILIKE $${paramIndex}`;
    paramIndex++;
    query += ` OR brand ILIKE $${paramIndex}`;
    paramIndex++;
    query += ` OR area ILIKE $${paramIndex}`;
    paramIndex++;
    query += ` OR price ILIKE $${paramIndex})`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  query += ' ORDER BY hospital_name, project_name';

  try {
    const rows = await db.all(query, params);
    res.json(rows || []);
  } catch (err) {
    console.error('Error querying project prices:', err.message);
    res.status(500).json({ error: '查询失败', detail: err.message });
  }
});

module.exports = router;
