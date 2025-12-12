import pool from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const initDatabase = async () => {
  try {
    const connection = await pool.getConnection();
    
    // List of migration files to execute
    const migrations = [
      'create_users_table.sql',
      'create_customers_table_consolidated.sql',
      'create_services_table_consolidated.sql',
      'create_service_commands_table.sql',
      'create_password_reset_tokens_table.sql',
      'create_invoices_table_consolidated.sql',
      'create_leads_table.sql',
      'create_form_data_table.sql',
      'migrate_form_data_to_separate_table.sql',
      'create_attendance_table.sql',
    ];
    
    for (const migrationFile of migrations) {
      const migrationPath = path.join(__dirname, 'migrations', migrationFile);
      
      if (fs.existsSync(migrationPath)) {
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        // Split by semicolon and execute each statement
        const statements = migrationSQL
          .split(';')
          .map(stmt => stmt.trim())
          .filter(stmt => stmt.length > 0);
        
        for (const statement of statements) {
          try {
            await connection.query(statement);
          } catch (err) {
            // Ignore "table already exists", "duplicate column", "duplicate key", "index doesn't exist", and "column already has that definition" errors
            if (!err.message.includes('already exists') && 
                !err.message.includes('Duplicate column') &&
                !err.message.includes('does not exist') &&
                !err.message.includes('Duplicate key name') &&
                !err.message.includes('Duplicate entry') &&
                !err.message.includes('Unknown key') &&
                !err.message.includes('already has that definition')) {
              throw err;
            }
          }
        }
      }
    }
    
    connection.release();
    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
    throw error;
  }
};

export default initDatabase;

