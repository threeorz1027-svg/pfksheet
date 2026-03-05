const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 根据环境选择数据库路径
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/tmp/database.db' 
  : path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    // 创建表
    createTable();
  }
});

// 创建表
function createTable() {
  // 创建兑换码表
  const createRedeemCodesTable = `
    CREATE TABLE IF NOT EXISTS redeem_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      type TEXT DEFAULT 'day' NOT NULL,
      used BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;
  
  // 创建分类表
  const createCategoriesTable = `
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;
  
  // 创建项目表
  const createItemsTable = `
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      hospital_name TEXT NOT NULL,
      price TEXT,
      address TEXT,
      has_chinese_staff BOOLEAN DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
    );
  `;
  
  // 执行创建表语句
  db.serialize(() => {
    db.run(createRedeemCodesTable, (err) => {
      if (err) {
        console.error('Error creating redeem_codes table:', err.message);
      } else {
        console.log('redeem_codes table created successfully.');
        // 检查并添加 type 列（如果不存在）
        addTypeColumnIfNotExists();
      }
    });
    
    db.run(createCategoriesTable, (err) => {
      if (err) {
        console.error('Error creating categories table:', err.message);
      } else {
        console.log('categories table created successfully.');
        // 插入示例分类数据
        insertSampleCategories();
      }
    });
    
    db.run(createItemsTable, (err) => {
      if (err) {
        console.error('Error creating items table:', err.message);
      } else {
        console.log('items table created successfully.');
      }
    });
    
    // 创建项目价格表
    const createProjectPricesTable = `
      CREATE TABLE IF NOT EXISTS project_prices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hospital_name TEXT NOT NULL,
        category TEXT,
        project_name TEXT NOT NULL,
        spec TEXT,
        brand TEXT,
        area TEXT,
        price TEXT,
        address TEXT,
        appointment_method TEXT,
        raw_category TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    db.run(createProjectPricesTable, (err) => {
      if (err) {
        console.error('Error creating project_prices table:', err.message);
      } else {
        console.log('project_prices table created successfully.');
        // 检查并添加新字段（如果不存在）
        addNewColumnsToProjectPrices();
      }
    });
  });
}

// 插入示例分类数据
function insertSampleCategories() {
  const categories = [
    { name: '丽珠兰黑2cc', sort_order: 1 },
    { name: '丽珠兰白2cc', sort_order: 2 }
  ];
  
  const insertSQL = 'INSERT OR IGNORE INTO categories (name, sort_order) VALUES (?, ?)';
  
  categories.forEach(category => {
    db.run(insertSQL, [category.name, category.sort_order], (err) => {
      if (err) {
        console.error('Error inserting category:', err.message);
      } else {
        console.log(`Category "${category.name}" inserted successfully.`);
        // 为每个分类插入示例医院数据
        if (this.lastID) {
          insertSampleItems(this.lastID, category.name);
        }
      }
    });
  });
}

// 插入示例医院数据
function insertSampleItems(categoryId, categoryName) {
  const items = [];
  
  if (categoryName === '丽珠兰黑2cc') {
    items.push(
      { hospital_name: '首尔整形医院', price: '1200000韩元', address: '首尔江南区', has_chinese_staff: 1, sort_order: 1 },
      { hospital_name: '釜山医美中心', price: '1000000韩元', address: '釜山釜山区', has_chinese_staff: 0, sort_order: 2 }
    );
  } else if (categoryName === '丽珠兰白2cc') {
    items.push(
      { hospital_name: '首尔整形医院', price: '1500000韩元', address: '首尔江南区', has_chinese_staff: 1, sort_order: 1 },
      { hospital_name: '仁川美容诊所', price: '1300000韩元', address: '仁川中区', has_chinese_staff: 1, sort_order: 2 }
    );
  }
  
  const insertSQL = 'INSERT INTO items (category_id, hospital_name, price, address, has_chinese_staff, sort_order) VALUES (?, ?, ?, ?, ?, ?)';
  
  items.forEach(item => {
    db.run(insertSQL, [categoryId, item.hospital_name, item.price, item.address, item.has_chinese_staff, item.sort_order], (err) => {
      if (err) {
        console.error('Error inserting item:', err.message);
      } else {
        console.log(`Item "${item.hospital_name}" inserted successfully.`);
      }
    });
  });
}

// 检查并添加 type 列（如果不存在）
function addTypeColumnIfNotExists() {
  // 查询表结构
  db.all("PRAGMA table_info(redeem_codes)", (err, columns) => {
    if (err) {
      console.error('Error checking table structure:', err.message);
      return;
    }
    
    // 检查是否存在 type 列
    const hasTypeColumn = columns.some(column => column.name === 'type');
    
    if (!hasTypeColumn) {
      // 添加 type 列
      db.run("ALTER TABLE redeem_codes ADD COLUMN type TEXT DEFAULT 'day' NOT NULL", (err) => {
        if (err) {
          console.error('Error adding type column:', err.message);
        } else {
          console.log('Added type column to redeem_codes table.');
        }
      });
    }
  });
}

// 检查并添加 project_prices 表的新字段（如果不存在）
function addNewColumnsToProjectPrices() {
  // 查询表结构
  db.all("PRAGMA table_info(project_prices)", (err, columns) => {
    if (err) {
      console.error('Error checking table structure:', err.message);
      return;
    }
    
    // 检查是否存在 address 列
    const hasAddressColumn = columns.some(column => column.name === 'address');
    
    if (!hasAddressColumn) {
      // 添加 address 列
      db.run("ALTER TABLE project_prices ADD COLUMN address TEXT", (err) => {
        if (err) {
          console.error('Error adding address column:', err.message);
        } else {
          console.log('Added address column to project_prices table.');
        }
      });
    }
    
    // 检查是否存在 appointment_method 列
    const hasAppointmentMethodColumn = columns.some(column => column.name === 'appointment_method');
    
    if (!hasAppointmentMethodColumn) {
      // 添加 appointment_method 列
      db.run("ALTER TABLE project_prices ADD COLUMN appointment_method TEXT", (err) => {
        if (err) {
          console.error('Error adding appointment_method column:', err.message);
        } else {
          console.log('Added appointment_method column to project_prices table.');
        }
      });
    }
  });
}

// 导出数据库连接
exports.db = db;