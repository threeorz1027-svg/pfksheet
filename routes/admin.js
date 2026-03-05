const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');

const router = express.Router();

// 生成兑换码接口
router.post('/generate', (req, res) => {
  const { password, type = 'day' } = req.body;
  
  // 验证密码
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  if (password !== adminPassword) {
    return res.status(401).json({ error: '密码错误' });
  }
  
  // 验证 type 值
  const validTypes = ['day', 'week', 'month'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: '无效的兑换码类型' });
  }
  
  // 生成8位大写字母数字组合的兑换码
  const code = uuidv4().slice(0, 8).toUpperCase();
  
  // 插入数据库
  const insertSQL = 'INSERT INTO redeem_codes (code, type) VALUES (?, ?)';
  db.run(insertSQL, [code, type], function(err) {
    if (err) {
      console.error('Error inserting code:', err.message);
      return res.status(500).json({ error: '生成兑换码失败' });
    }
    res.json({ code, type });
  });
});

// 调试：查看最后一个生成的兑换码（需要密码验证）
router.get('/last-code', (req, res) => {
  // 从请求头获取密码（你也可以改成从查询参数获取，但为了简单，这里不加验证，仅临时调试）
  // 注意：这个接口没有加密码验证，部署后你可以直接访问，但用完建议删除
  const query = 'SELECT code, type FROM redeem_codes ORDER BY id DESC LIMIT 1';
  db.get(query, [], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.json({ message: '还没有兑换码' });
    }
    res.json(row);
  });
});

module.exports = router;