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

// 获取筛选选项 GET /api/project-prices/options（去重、去空、TRIM 避免空格导致缺失）
router.get('/options', checkRedeemedCookie, async (req, res) => {
  // 使用 TRIM 保证前后空格不影响去重，且空串/纯空格排除
  const categoriesQuery = `
    SELECT DISTINCT TRIM(category) AS category
    FROM project_prices
    WHERE category IS NOT NULL AND TRIM(category) != ''
    ORDER BY category
  `;
  const projectsQuery = `
    SELECT DISTINCT TRIM(project_name) AS project_name
    FROM project_prices
    WHERE project_name IS NOT NULL AND TRIM(project_name) != ''
    ORDER BY project_name
  `;
  const mappingQuery = `
    SELECT DISTINCT TRIM(category) AS category, TRIM(project_name) AS project_name
    FROM project_prices
    WHERE category IS NOT NULL AND project_name IS NOT NULL
      AND TRIM(category) != '' AND TRIM(project_name) != ''
    ORDER BY category, project_name
  `;

  try {
    const categoriesRows = await db.all(categoriesQuery, []);
    const projectsRows = await db.all(projectsQuery, []);
    const mappings = await db.all(mappingQuery, []);

    const projectsByCategory = {};
    (mappings || []).forEach(row => {
      const cat = row.category;
      const proj = row.project_name;
      if (!cat || !proj) return;
      if (!projectsByCategory[cat]) projectsByCategory[cat] = [];
      if (!projectsByCategory[cat].includes(proj)) projectsByCategory[cat].push(proj);
    });

    res.json({
      categories: (categoriesRows || []).map(c => c.category).filter(Boolean),
      projects: (projectsRows || []).map(p => p.project_name).filter(Boolean),
      projectsByCategory
    });
  } catch (err) {
    console.error('Error fetching options:', err.message);
    res.status(500).json({ error: '获取大类失败', detail: err.message });
  }
});

// 查询接口 GET /api/project-prices（TRIM 匹配下拉选项 + 关键词搜 project_name/hospital_name/category 等）
router.get('/', checkRedeemedCookie, async (req, res) => {
  const { category, project, search } = req.query;
  let query = 'SELECT * FROM project_prices WHERE 1=1';
  const params = [];
  let paramIndex = 0;

  if (category && category !== 'all') {
    paramIndex++;
    query += ` AND TRIM(category) = $${paramIndex}`;
    params.push(category);
  }
  if (project && project !== 'all') {
    paramIndex++;
    query += ` AND TRIM(project_name) = $${paramIndex}`;
    params.push(project);
  }
  const searchTrimmed = (search || '').trim();
  if (searchTrimmed) {
    const searchTerm = `%${searchTrimmed}%`;
    // 关键词搜索：规格、品牌、部位、价格、项目名、医院名、大类
    paramIndex++;
    query += ` AND (spec ILIKE $${paramIndex}`;
    paramIndex++;
    query += ` OR brand ILIKE $${paramIndex}`;
    paramIndex++;
    query += ` OR area ILIKE $${paramIndex}`;
    paramIndex++;
    query += ` OR price ILIKE $${paramIndex}`;
    paramIndex++;
    query += ` OR project_name ILIKE $${paramIndex}`;
    paramIndex++;
    query += ` OR hospital_name ILIKE $${paramIndex}`;
    paramIndex++;
    query += ` OR category ILIKE $${paramIndex})`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
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
