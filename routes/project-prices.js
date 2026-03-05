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

// 获取筛选选项 GET /api/project-prices/options
router.get('/options', checkRedeemedCookie, (req, res) => {
  // 获取所有大类
  const categoriesQuery = 'SELECT DISTINCT category FROM project_prices WHERE category IS NOT NULL AND category != "" ORDER BY category';
  
  // 获取所有项目
  const projectsQuery = 'SELECT DISTINCT project_name FROM project_prices WHERE project_name IS NOT NULL AND project_name != "" ORDER BY project_name';
  
  // 获取大类和项目的对应关系（用于联动）
  const mappingQuery = 'SELECT DISTINCT category, project_name FROM project_prices WHERE category IS NOT NULL AND project_name IS NOT NULL ORDER BY category, project_name';
  
  db.all(categoriesQuery, [], (err, categories) => {
    if (err) {
      console.error('Error fetching categories:', err.message);
      return res.status(500).json({ error: '获取大类失败' });
    }
    
    db.all(projectsQuery, [], (err, projects) => {
      if (err) {
        console.error('Error fetching projects:', err.message);
        return res.status(500).json({ error: '获取项目失败' });
      }
      
      db.all(mappingQuery, [], (err, mappings) => {
        if (err) {
          console.error('Error fetching mappings:', err.message);
          return res.status(500).json({ error: '获取映射关系失败' });
        }
        
        // 构建projectsByCategory对象
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
          categories: categories.map(c => c.category),
          projects: projects.map(p => p.project_name),
          projectsByCategory: projectsByCategory
        });
      });
    });
  });
});

// 查询接口 GET /api/project-prices
router.get('/', checkRedeemedCookie, (req, res) => {
  const { category, project, search } = req.query;
  
  let query = 'SELECT * FROM project_prices WHERE 1=1';
  const params = [];
  
  // 大类筛选
  if (category && category !== 'all') {
    query += ' AND category = ?';
    params.push(category);
  }
  
  // 项目筛选
  if (project && project !== 'all') {
    query += ' AND project_name = ?';
    params.push(project);
  }
  
  // 全局模糊搜索
  if (search && search.trim()) {
    const searchTerm = `%${search.trim()}%`;
    query += ' AND (spec LIKE ? OR brand LIKE ? OR area LIKE ? OR price LIKE ?)';
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }
  
  query += ' ORDER BY hospital_name, project_name';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error querying project prices:', err.message);
      return res.status(500).json({ error: '查询失败' });
    }
    
    res.json(rows);
  });
});

module.exports = router;
