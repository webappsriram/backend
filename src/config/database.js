import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'invo_db',
  waitForConnections: true,
  port: process.env.DB_PORT || 3306,
  connectionLimit: 5, // Reduced from 10 to 5
  queueLimit: 10, // Limited queue to prevent unbounded growth
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  acquireTimeout: 60000, // 60 seconds timeout to acquire connection
  timeout: 60000, // 60 seconds query timeout
  reconnect: true
});

// Test database connection
pool.getConnection()
  .then(connection => {
    console.log('✅ Database connected successfully');
    connection.release();
  })
  .catch(err => {
    console.error('❌ Database connection error:', err.message);
  });

export default pool;

