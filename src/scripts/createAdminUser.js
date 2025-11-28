import pool from '../config/database.js';
import { hashPassword } from '../utils/auth.js';
import dotenv from 'dotenv';

dotenv.config();

const createAdminUser = async () => {
  try {
    const name = process.env.ADMIN_NAME || 'master';
    const email = process.env.ADMIN_EMAIL || 'master@sriram.com';
    const password = process.env.ADMIN_PASSWORD || 'master123';
    const role = process.env.ADMIN_ROLE || 'master_user';

    // Check if user already exists
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      console.log('⚠️  Admin user already exists with email:', email);
      return;
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Insert admin user
    const [result] = await pool.execute(
      `INSERT INTO users (name, email, password, role, is_deleted) 
       VALUES (?, ?, ?, ?, FALSE)`,
      [name, email, hashedPassword, role]
    );

    console.log('✅ Admin user created successfully!');
    console.log('📧 Email:', email);
    console.log('🔑 Password:', password);
    console.log('👤 Role:', role);
    console.log('⚠️  Please change the default password after first login!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
};

createAdminUser();

