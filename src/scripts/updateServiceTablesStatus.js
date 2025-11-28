import pool from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Update all existing service_{id}_{name} tables to include 'Lead' in status ENUM
 */
const updateServiceTablesStatus = async () => {
  const connection = await pool.getConnection();
  try {
    // Find all service tables
    const [tables] = await connection.query(
      `SELECT TABLE_NAME 
       FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME LIKE 'service_%' 
       AND TABLE_TYPE = 'BASE TABLE'`
    );

    console.log(`Found ${tables.length} service tables to check...`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const table of tables) {
      const tableName = table.TABLE_NAME;
      
      try {
        // Check if status column exists
        const [columns] = await connection.query(
          `SELECT COLUMN_NAME, COLUMN_TYPE 
           FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = ? 
           AND COLUMN_NAME = 'status'`,
          [tableName]
        );

        if (columns.length > 0) {
          const columnType = columns[0].COLUMN_TYPE;
          
          // Check if 'Lead' is not in the ENUM
          if (!columnType.includes("'Lead'")) {
            // Modify the ENUM to include 'Lead'
            const modifySQL = `ALTER TABLE \`${tableName}\` 
              MODIFY COLUMN status ENUM('Yet to start', 'In Progress', 'Blocked', 'Will not do', 'Completed', 'Lead') 
              DEFAULT 'Yet to start'`;
            
            await connection.query(modifySQL);
            console.log(`✅ Updated ${tableName} - Added 'Lead' to status ENUM`);
            updatedCount++;
          } else {
            console.log(`⏭️  Skipped ${tableName} - Already has 'Lead' in status ENUM`);
            skippedCount++;
          }
        } else {
          console.log(`⚠️  Skipped ${tableName} - No status column found`);
          skippedCount++;
        }
      } catch (error) {
        console.error(`❌ Error updating ${tableName}:`, error.message);
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Updated: ${updatedCount} tables`);
    console.log(`   Skipped: ${skippedCount} tables`);
    console.log(`   Total: ${tables.length} tables`);

    connection.release();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating service tables:', error);
    connection.release();
    process.exit(1);
  }
};

updateServiceTablesStatus();

