const express = require('express');
const router = express.Router();
const xlsx = require('xlsx');
const { db } = require('../database');

// 验证管理员密码
function verifyAdminPassword(req, res, next) {
  const password = req.headers['x-admin-password'] || req.body.password || req.query.password;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (!password || password !== adminPassword) {
    return res.status(401).json({ error: '密码错误' });
  }
  next();
}

// Excel导入接口 POST /api/admin/project-prices/import
router.post('/import', verifyAdminPassword, async (req, res) => {
  // 检查是否有文件
  if (!req.file) {
    return res.status(400).json({ error: '请上传Excel文件' });
  }

  try {
    // 1. 解析 Excel 文件
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ error: 'Excel文件为空' });
    }
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);
    if (data.length === 0) {
      return res.status(400).json({ error: 'Excel文件中没有数据' });
    }

    // 验证必需字段
    const requiredFields = ['hospital_name', 'project_name'];
    const firstRow = data[0];
    const missingFields = requiredFields.filter(field => !(field in firstRow));
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Excel文件缺少必需字段: ${missingFields.join(', ')}`,
        expectedFields: ['hospital_name', 'category', 'project_name', 'spec', 'brand', 'area', 'price', 'address', 'appointment_method', 'raw_category']
      });
    }

    // 2. 获取数据库连接（用于事务）
    const client = await db.connect();
    let successCount = 0;
    let errorCount = 0;

    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM project_prices');

      const insertSQL = `
        INSERT INTO project_prices
        (hospital_name, category, project_name, spec, brand, area, price, address, appointment_method, raw_category)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;

      for (let index = 0; index < data.length; index++) {
        const row = data[index];
        const hospital_name = (row.hospital_name || '').toString().trim();
        const project_name = (row.project_name || '').toString().trim();
        if (!hospital_name || !project_name) {
          errorCount++;
          console.warn(`Row ${index + 2} skipped: missing hospital_name or project_name`);
          continue;
        }
        try {
          await client.query(insertSQL, [
            hospital_name,
            (row.category || '').toString(),
            project_name,
            (row.spec || '').toString(),
            (row.brand || '').toString(),
            (row.area || '').toString(),
            (row.price || '').toString(),
            (row.address || '').toString(),
            (row.appointment_method || '').toString(),
            (row.raw_category || '').toString()
          ]);
          successCount++;
        } catch (err) {
          errorCount++;
          console.error(`Error inserting row ${index + 2}:`, err.message);
        }
      }

      await client.query('COMMIT');
      res.json({
        success: true,
        message: '导入成功',
        stats: {
          total: data.length,
          success: successCount,
          error: errorCount
        }
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: '导入失败: ' + (error.message || '处理Excel文件失败') });
  }
});

// 下载模板接口 GET /api/admin/project-prices/template
router.get('/template', verifyAdminPassword, (req, res) => {
  // 创建模板数据
  const templateData = [
    {
      hospital_name: '首尔整形医院',
      category: '光电/仪器',
      project_name: '美版热玛吉FLX',
      spec: '300发',
      brand: 'Thermage',
      area: '面部',
      price: '1次:49,000, 5次:199,000',
      address: '首尔市江南区奉恩寺路123号',
      appointment_method: '电话 02-1234-5678',
      raw_category: '激光类'
    },
    {
      hospital_name: '釜山医美中心',
      category: '注射类',
      project_name: '玻尿酸填充',
      spec: '1cc',
      brand: 'Juvederm',
      area: '鼻部',
      price: '300,000韩元',
      address: '釜山市釜山区海云台路456号',
      appointment_method: '微信:busan_clinic',
      raw_category: '注射填充'
    }
  ];
  
  // 创建工作簿
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(templateData);
  
  // 设置列宽
  const colWidths = [
    { wch: 20 }, // hospital_name
    { wch: 15 }, // category
    { wch: 20 }, // project_name
    { wch: 15 }, // spec
    { wch: 15 }, // brand
    { wch: 15 }, // area
    { wch: 25 }, // price
    { wch: 30 }, // address
    { wch: 30 }, // appointment_method
    { wch: 15 }  // raw_category
  ];
  worksheet['!cols'] = colWidths;
  
  xlsx.utils.book_append_sheet(workbook, worksheet, 'project_prices');
  
  // 生成Excel文件
  const excelBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  
  // 设置响应头
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=project_prices_template.xlsx');
  res.send(excelBuffer);
});

// 获取记录列表 GET /api/admin/project-prices
router.get('/', verifyAdminPassword, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const search = req.query.search || '';
  const offset = (page - 1) * limit;
  
  let query = 'SELECT * FROM project_prices';
  let countQuery = 'SELECT COUNT(*) as total FROM project_prices';
  const params = [];
  
  if (search) {
    const searchTerm = `%${search}%`;
    const searchCondition = ' WHERE hospital_name LIKE ? OR category LIKE ? OR project_name LIKE ? OR spec LIKE ? OR brand LIKE ? OR area LIKE ? OR price LIKE ? OR address LIKE ? OR appointment_method LIKE ? OR raw_category LIKE ?';
    query += searchCondition;
    countQuery += searchCondition;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }
  
  query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  // 执行计数查询
  db.get(countQuery, params.slice(0, params.length - 2), (err, countResult) => {
    if (err) {
      console.error('Error counting records:', err.message);
      return res.status(500).json({ error: '获取数据失败' });
    }
    
    const total = countResult.total || 0;
    
    // 执行数据查询
    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('Error fetching records:', err.message);
        return res.status(500).json({ error: '获取数据失败' });
      }
      
      res.json({
        data: rows,
        total: total,
        page: page,
        limit: limit
      });
    });
  });
});

// 新增记录 POST /api/admin/project-prices
router.post('/', verifyAdminPassword, (req, res) => {
  const { hospital_name, category, project_name, spec, brand, area, price, address, appointment_method, raw_category } = req.body;
  
  // 验证必需字段
  if (!hospital_name || !project_name) {
    return res.status(400).json({ error: '医院名称和项目名称为必填字段' });
  }
  
  const insertSQL = `
    INSERT INTO project_prices 
    (hospital_name, category, project_name, spec, brand, area, price, address, appointment_method, raw_category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  db.run(insertSQL, [hospital_name, category || '', project_name, spec || '', brand || '', area || '', price || '', address || '', appointment_method || '', raw_category || ''], function(err) {
    if (err) {
      console.error('Error inserting record:', err.message);
      return res.status(500).json({ error: '添加记录失败' });
    }
    
    res.json({
      success: true,
      id: this.lastID,
      message: '记录添加成功'
    });
  });
});

// 更新记录 PUT /api/admin/project-prices/:id
router.put('/:id', verifyAdminPassword, (req, res) => {
  const id = parseInt(req.params.id);
  const { hospital_name, category, project_name, spec, brand, area, price, address, appointment_method, raw_category } = req.body;
  
  // 验证必需字段
  if (!hospital_name || !project_name) {
    return res.status(400).json({ error: '医院名称和项目名称为必填字段' });
  }
  
  const updateSQL = `
    UPDATE project_prices 
    SET hospital_name = ?, category = ?, project_name = ?, spec = ?, brand = ?, area = ?, price = ?, address = ?, appointment_method = ?, raw_category = ?
    WHERE id = ?
  `;
  
  db.run(updateSQL, [hospital_name, category || '', project_name, spec || '', brand || '', area || '', price || '', address || '', appointment_method || '', raw_category || '', id], function(err) {
    if (err) {
      console.error('Error updating record:', err.message);
      return res.status(500).json({ error: '更新记录失败' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: '记录不存在' });
    }
    
    res.json({
      success: true,
      message: '记录更新成功'
    });
  });
});

// 批量删除记录 DELETE /api/admin/project-prices/batch
router.delete('/batch', verifyAdminPassword, (req, res) => {
  const { ids } = req.body;
  
  // 验证ids参数
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '请提供有效的id数组' });
  }
  
  // 确保ids都是数字
  const validIds = ids.filter(id => Number.isInteger(id));
  if (validIds.length === 0) {
    return res.status(400).json({ error: '请提供有效的id数组' });
  }
  
  // 构建SQL语句
  const placeholders = validIds.map(() => '?').join(',');
  const deleteSQL = `DELETE FROM project_prices WHERE id IN (${placeholders})`;
  
  db.run(deleteSQL, validIds, function(err) {
    if (err) {
      console.error('Error deleting records:', err.message);
      return res.status(500).json({ error: '批量删除失败' });
    }
    
    res.json({
      success: true,
      deletedCount: this.changes,
      message: '批量删除成功'
    });
  });
});

// 批量清空记录 DELETE /api/admin/project-prices/clear
router.delete('/clear', verifyAdminPassword, (req, res) => {
  // 执行清空操作
  const deleteSQL = 'DELETE FROM project_prices';
  
  db.run(deleteSQL, function(err) {
    if (err) {
      console.error('Error clearing records:', err.message);
      return res.status(500).json({ error: '批量清空失败' });
    }
    
    res.json({
      success: true,
      deletedCount: this.changes,
      message: '批量清空成功'
    });
  });
});

// 删除记录 DELETE /api/admin/project-prices/:id
router.delete('/:id', verifyAdminPassword, (req, res) => {
  const id = parseInt(req.params.id);
  
  const deleteSQL = 'DELETE FROM project_prices WHERE id = ?';
  
  db.run(deleteSQL, [id], function(err) {
    if (err) {
      console.error('Error deleting record:', err.message);
      return res.status(500).json({ error: '删除记录失败' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: '记录不存在' });
    }
    
    res.json({
      success: true,
      message: '记录删除成功'
    });
  });
});

module.exports = router;
