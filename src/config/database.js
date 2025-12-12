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
  connectionLimit: 5, // Maximum 5 connections
  queueLimit: 10, // Limited queue to prevent unbounded growth
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  acquireTimeout: 30000, // 30 seconds timeout to acquire connection
  timeout: 30000, // 30 seconds query timeout
  reconnect: true,
  idleTimeout: 300000, // 5 minutes - close idle connections after 5 min
  maxIdle: 2 // Maximum idle connections to keep (less than connectionLimit)
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

// Helper function to get pool stats (for monitoring)
export const getPoolStats = () => {
  try {
    // mysql2/promise pool doesn't expose stats directly, but we can return config
    return {
      connectionLimit: pool.config.connectionLimit,
      queueLimit: pool.config.queueLimit,
      acquireTimeout: pool.config.acquireTimeout,
      timeout: pool.config.timeout
    };
  } catch (error) {
    return null;
  }
};

export default pool;

