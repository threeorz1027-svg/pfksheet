const express = require('express');
const { db } = require('../database');

const router = express.Router();

// 验证兑换码接口（PostgreSQL：$1,$2 占位符 + async/await）
router.post('/verify', async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: '请输入兑换码' });
  }

  const now = new Date().toISOString();
  const checkSQL = 'SELECT * FROM redeem_codes WHERE code = $1 AND expires_at > $2';

  try {
    const row = await db.get(checkSQL, [code, now]);

    if (!row) {
      return res.status(404).json({ error: '兑换码无效或已过期' });
    }

    let maxAge;
    switch (row.type) {
      case 'day':
        maxAge = 24 * 60 * 60 * 1000; // 24小时
        break;
      case 'week':
        maxAge = 7 * 24 * 60 * 60 * 1000; // 7天
        break;
      case 'month':
        maxAge = 30 * 24 * 60 * 60 * 1000; // 30天
        break;
      default:
        maxAge = 24 * 60 * 60 * 1000;
    }

    res.cookie('redeemed', 'true', {
      httpOnly: true,
      maxAge: maxAge
    });

    res.json({
      success: true,
      type: row.type
    });
  } catch (err) {
    console.error('Error checking code:', err.message);
    res.status(500).json({ error: '验证失败', detail: err.message });
  }
});

module.exports = router;