const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');

let db;

if (process.env.DATABASE_URL) {
  // 生产环境：使用 PostgreSQL (Neon)
  console.log('Using PostgreSQL (Neon)');
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  // 为 pg 添加类似 sqlite3 的 run, get, all 方法
  const pgDb = db;
  pgDb.run = async (sql, params, callback) => {
    try {
      const res = await pgDb.query(sql, params);
      if (callback) callback(null, { changes: res.rowCount });
      return { changes: res.rowCount };
    } catch (err) {
      if (callback) callback(err);
      throw err;
    }
  };
  pgDb.get = async (sql, params, callback) => {
    try {
      const res = await pgDb.query(sql, params);
      const row = res.rows[0];
      if (callback) callback(null, row);
      return row;
    } catch (err) {
      if (callback) callback(err);
      throw err;
    }
  };
  pgDb.all = async (sql, params, callback) => {
    try {
      const res = await pgDb.query(sql, params);
      if (callback) callback(null, res.rows);
      return res.rows;
    } catch (err) {
      if (callback) callback(err);
      throw err;
    }
  };

  // 测试连接并创建表
  (async () => {
    try {
      await pgDb.connect();
      console.log('Connected to PostgreSQL.');
      await createTablesPostgres(pgDb);
    } catch (err) {
      console.error('Error connecting to PostgreSQL:', err);
    }
  })();

  module.exports = { db: pgDb };
} else {
  // 开发环境：使用 SQLite
  console.log('Using SQLite (local)');
  const dbPath = path.join(__dirname, 'database.db');
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening SQLite database:', err.message);
    } else {
      console.log('Connected to SQLite database.');
      createTablesSQLite(db);
    }
  });
  module.exports = { db };
}

// SQLite 建表函数
function createTablesSQLite(db) {
  const createRedeemCodesTable = `
    CREATE TABLE IF NOT EXISTS redeem_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      type TEXT DEFAULT 'day' NOT NULL,
      used BOOLEAN DEFAULT 0,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;
  const createCategoriesTable = `
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;
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

  db.serialize(() => {
    db.run(createRedeemCodesTable, (err) => {
      if (err) console.error('Error creating redeem_codes table:', err.message);
      else console.log('redeem_codes table created successfully.');
    });
    db.run(createCategoriesTable, (err) => {
      if (err) console.error('Error creating categories table:', err.message);
      else console.log('categories table created successfully.');
    });
    db.run(createItemsTable, (err) => {
      if (err) console.error('Error creating items table:', err.message);
      else console.log('items table created successfully.');
    });
    db.run(createProjectPricesTable, (err) => {
      if (err) console.error('Error creating project_prices table:', err.message);
      else console.log('project_prices table created successfully.');
    });
  });
}

// PostgreSQL 建表函数
async function createTablesPostgres(db) {
  const client = await db.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS redeem_codes (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        type TEXT DEFAULT 'day' NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('PostgreSQL: redeem_codes table ready.');

    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('PostgreSQL: categories table ready.');

    await client.query(`
      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        hospital_name TEXT NOT NULL,
        price TEXT,
        address TEXT,
        has_chinese_staff BOOLEAN DEFAULT FALSE,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('PostgreSQL: items table ready.');

    await client.query(`
      CREATE TABLE IF NOT EXISTS project_prices (
        id SERIAL PRIMARY KEY,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('PostgreSQL: project_prices table ready.');
  } catch (err) {
    console.error('Error creating PostgreSQL tables:', err);
  } finally {
    client.release();
  }
}