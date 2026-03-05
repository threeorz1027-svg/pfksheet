const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const cookieParser = require('cookie-parser');
const multer = require('multer');

// 加载环境变量
dotenv.config();

// 配置multer用于文件上传
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 限制文件大小为5MB
  },
  fileFilter: (req, file, cb) => {
    // 只允许Excel文件
    const allowedTypes = ['.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传Excel文件(.xlsx, .xls)'));
    }
  }
});

// 创建Express应用
const app = express();

// 解析JSON请求体
app.use(express.json());

// 使用cookie-parser中间件
app.use(cookieParser());

// 当访问根路径 / 时，跳转到 redeem.html 页面
app.get('/', (req, res) => {
  res.redirect('/redeem.html');
});

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 挂载路由
const adminRoutes = require('./routes/admin');
const redeemRoutes = require('./routes/redeem');
const projectPricesRoutes = require('./routes/project-prices');
const adminProjectPricesRoutes = require('./routes/admin-project-prices');

app.use('/api/admin', adminRoutes);
app.use('/api/redeem', redeemRoutes);
app.use('/api/project-prices', projectPricesRoutes);

// 为admin-project-prices路由应用multer中间件（仅对POST请求）
app.use('/api/admin/project-prices', (req, res, next) => {
  if (req.method === 'POST' && req.path === '/import') {
    return upload.single('file')(req, res, next);
  }
  next();
}, adminProjectPricesRoutes);

// 项目价格查询页面路由
app.get('/project-search', (req, res) => {
  // 检查cookie是否存在
  if (!req.cookies.redeemed) {
    // 重定向到兑换页面
    return res.redirect('/redeem.html');
  }
  // 发送静态页面
  res.sendFile(path.join(__dirname, 'public', 'project-search.html'));
});

// 导出应用供 Vercel 使用
module.exports = app;