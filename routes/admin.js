const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');

const router = express.Router();

// 根据类型计算过期时间
function calculateExpiresAt(type) {
  const now = new Date();
  switch (type) {
    case 'day':
      now.setDate(now.getDate() + 1);
      break;
    case 'week':
      now.setDate(now.getDate() + 7);
      break;
    case 'month':
      now.setMonth(now.getMonth() + 1);
      break;
    default:
      now.setDate(now.getDate() + 1);
  }
  return now.toISOString();
}

// 生成兑换码接口（PostgreSQL：使用 $1,$2,$3 占位符 + async/await）
router.post('/generate', async (req, res) => {
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
  const expiresAt = calculateExpiresAt(type);

  const insertSQL = 'INSERT INTO redeem_codes (code, type, expires_at) VALUES ($1, $2, $3)';
  try {
    await db.run(insertSQL, [code, type, expiresAt]);
    res.json({ code, type });
  } catch (err) {
    console.error('Error inserting code:', err.message);
    res.status(500).json({ error: '生成兑换码失败', detail: err.message });
  }
});

module.exports = router;