const express = require('express');
const { db } = require('../database');

const router = express.Router();

// 验证兑换码接口
router.post('/verify', (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: '请输入兑换码' });
  }
  
  // 获取当前时间，检查过期时间
  const now = new Date().toISOString();
  const checkSQL = 'SELECT * FROM redeem_codes WHERE code = ? AND expires_at > ?';
  db.get(checkSQL, [code, now], (err, row) => {
    if (err) {
      console.error('Error checking code:', err.message);
      return res.status(500).json({ error: '验证失败' });
    }
    
    if (!row) {
      return res.status(404).json({ error: '兑换码无效或已过期' });
    }
    
    // 根据兑换码类型设置不同的有效期
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
    
    // 设置 cookie
    res.cookie('redeemed', 'true', {
      httpOnly: true,
      maxAge: maxAge
    });
    
    // 返回成功信息
    res.json({
      success: true,
      type: row.type
    });
  });
});

module.exports = router;