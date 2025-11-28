/**
 * Utility functions for creating and managing dynamic tables based on form schemas
 */

/**
 * Sanitize table name to be SQL-safe
 */
export const sanitizeTableName = (serviceName) => {
  // Convert to lowercase, replace spaces and special chars with underscores
  return serviceName
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
};

/**
 * Generate service reference ID
 * Format: {first 5 letters of service name}{date}{sequence number by date}
 * Example: ELECT20240101001
 */
export const generateServiceReferenceId = async (connection, tableName, serviceName) => {
  // Extract service name part from table name (remove service_{id}_ prefix)
  // Table name format: service_{serviceId}_{sanitized_service_name}
  const tableNameParts = tableName.split('_');
  let serviceNamePart = '';
  
  if (tableNameParts.length >= 3) {
    // Get everything after service_{id}_
    serviceNamePart = tableNameParts.slice(2).join('_');
  } else {
    // Fallback: use the provided serviceName
    serviceNamePart = sanitizeTableName(serviceName);
  }
  
  // Get first 5 letters (remove underscores, take alphanumeric only)
  const cleanName = serviceNamePart.replace(/_/g, '').replace(/[^a-z0-9]/gi, '');
  const first5Letters = cleanName.substring(0, 5).toUpperCase().padEnd(5, 'X'); // Pad with X if less than 5 chars
  
  // Get current date in YYYYMMDD format
  const today = new Date();
  const dateStr = today.getFullYear().toString() + 
                  String(today.getMonth() + 1).padStart(2, '0') + 
                  String(today.getDate()).padStart(2, '0');
  
  // Get the count of records created today with the same prefix
  const prefix = `${first5Letters}${dateStr}`;
  const [countResult] = await connection.execute(
    `SELECT COUNT(*) as count FROM \`${tableName}\` 
     WHERE service_reference_id LIKE ? AND is_deleted = FALSE`,
    [`${prefix}%`]
  );
  
  const sequenceNumber = (countResult[0].count + 1).toString().padStart(3, '0');
  
  return `${prefix}${sequenceNumber}`;
};

/**
 * Get SQL data type from field type
 * 
 * IMPORTANT: All dynamic form fields are stored as TEXT in the database.
 * Field types (number, date, phone, etc.) are ONLY used for:
 * - Frontend validation
 * - UI rendering (input types, date pickers, etc.)
 * - Backend validation if needed
 * 
 * This ensures:
 * 1. Consistent storage format
 * 2. No type conversion errors
 * 3. Flexibility to change field types without database migrations
 * 
 * @param {string} fieldType - The field type (text, number, date, phone, etc.)
 * @param {object} fieldConfig - Optional field configuration
 * @returns {string} Always returns 'TEXT'
 */
const getSQLDataType = (fieldType, fieldConfig = {}) => {
  // Always return TEXT for all field types regardless of fieldType parameter
  // Field type is used only for frontend validation and UI rendering
  return 'TEXT';
};

/**
 * Generate CREATE TABLE SQL for a dynamic service table
 * Each service gets its own unique table based on service ID
 * 
 * All dynamic form fields are created as TEXT columns regardless of field type.
 * Field types are only used for frontend validation and UI rendering.
 * 
 * @param {number} serviceId - The service ID
 * @param {string} serviceName - The service name
 * @param {object} formSchema - The form schema with fields array
 * @param {number} userId - The user ID creating the service
 * @returns {object} Object with sql (SQL string) and tableName
 */
export const generateCreateTableSQL = (serviceId, serviceName, formSchema, userId) => {
  // Use service ID to ensure unique table name for each service
  const tableName = `service_${serviceId}_${sanitizeTableName(serviceName)}`;
  
  let sql = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (\n`;
  sql += `  id INT AUTO_INCREMENT PRIMARY KEY,\n`;
  
  // Add dynamic columns from form schema
  // All columns are created as TEXT type regardless of field.type
  if (formSchema && Array.isArray(formSchema.fields)) {
    formSchema.fields.forEach((field, index) => {
      if (field.name && field.type) {
        const columnName = sanitizeTableName(field.name);
        // getSQLDataType always returns 'TEXT' - field.type is ignored for storage
        const dataType = getSQLDataType(field.type, field.config);
        const isRequired = field.required ? 'NOT NULL' : 'DEFAULT NULL';
        sql += `  \`${columnName}\` ${dataType} ${isRequired}`;
        
        // Add default value if specified (all stored as text, so convert to string)
        if (field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== '') {
          const defaultValueStr = String(field.defaultValue).replace(/'/g, "''");
          sql += ` DEFAULT '${defaultValueStr}'`;
        }
        
        sql += ',\n';
      }
    });
  }
  
  // Add service_reference_id column
  sql += `  service_reference_id VARCHAR(20) UNIQUE NOT NULL,\n`;
  
  // Add customer_id column to link to customers
  sql += `  customer_id INT NOT NULL,\n`;
  
  // Add default columns
  sql += `  created_by INT NOT NULL,\n`;
  sql += `  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n`;
  sql += `  modified_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n`;
  sql += `  is_deleted BOOLEAN DEFAULT FALSE,\n`;
  sql += `  INDEX idx_created_by (created_by),\n`;
  sql += `  INDEX idx_is_deleted (is_deleted),\n`;
  sql += `  INDEX idx_customer_id (customer_id),\n`;
  sql += `  INDEX idx_service_reference_id (service_reference_id),\n`;
  sql += `  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,\n`;
  sql += `  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE\n`;
  sql += `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;
  
  return { sql, tableName };
};

/**
 * Generate ALTER TABLE SQL to add new columns to existing dynamic table
 * 
 * All new columns are added as TEXT type regardless of field type.
 * Field types are only used for frontend validation and UI rendering.
 * 
 * @param {string} tableName - The table name
 * @param {array} newFields - Array of new field definitions
 * @param {array} existingFields - Array of existing field definitions (to avoid duplicates)
 * @returns {array} Array of ALTER TABLE SQL statements
 */
export const generateAlterTableSQL = (tableName, newFields, existingFields = []) => {
  const existingFieldNames = existingFields.map(f => sanitizeTableName(f.name));
  const alterStatements = [];
  
  newFields.forEach(field => {
    if (field.name && field.type) {
      const columnName = sanitizeTableName(field.name);
      
      // Only add if column doesn't exist
      if (!existingFieldNames.includes(columnName)) {
        // getSQLDataType always returns 'TEXT' - field.type is ignored for storage
        const dataType = getSQLDataType(field.type, field.config);
        const isRequired = field.required ? 'NOT NULL' : 'DEFAULT NULL';
        let alterSQL = `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${dataType} ${isRequired}`;
        
        // Add default value if specified (all stored as text, so convert to string)
        if (field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== '') {
          const defaultValueStr = String(field.defaultValue).replace(/'/g, "''");
          alterSQL += ` DEFAULT '${defaultValueStr}'`;
        }
        
        alterStatements.push(alterSQL);
      }
    }
  });
  
  return alterStatements;
};

/**
 * Get table name for a service
 * Uses service ID to ensure unique table name for each service
 */
export const getServiceTableName = (serviceId, serviceName) => {
  return `service_${serviceId}_${sanitizeTableName(serviceName)}`;
};


/**
 * Add assigned_to column to existing table if it doesn't exist
 */
export const addAssignedToColumnIfMissing = async (connection, tableName) => {
  try {
    // Check if assigned_to column exists
    const [columns] = await connection.query(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = ? 
       AND COLUMN_NAME = 'assigned_to'`,
      [tableName]
    );

    // If assigned_to column doesn't exist, add it
    if (columns.length === 0) {
      // Check if status column exists to determine position
      const [statusColumns] = await connection.query(
        `SELECT COLUMN_NAME 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = ? 
         AND COLUMN_NAME = 'status'`,
        [tableName]
      );

      const afterColumn = 'AFTER service_reference_id';
      
      // First add the column
      let alterSQL = `ALTER TABLE \`${tableName}\` 
        ADD COLUMN assigned_to INT DEFAULT NULL 
        ${afterColumn}`;
      
      await connection.query(alterSQL);
      
      // Then add index and foreign key separately
      try {
        await connection.query(`ALTER TABLE \`${tableName}\` ADD INDEX idx_assigned_to (assigned_to)`);
      } catch (idxError) {
        if (!idxError.message.includes('Duplicate key name')) {
          console.warn(`Could not add index for assigned_to in ${tableName}:`, idxError.message);
        }
      }
      
      try {
        await connection.query(`ALTER TABLE \`${tableName}\` 
          ADD FOREIGN KEY (assigned_to) REFERENCES customers(id) ON DELETE SET NULL`);
      } catch (fkError) {
        if (!fkError.message.includes('Duplicate foreign key')) {
          console.warn(`Could not add foreign key for assigned_to in ${tableName}:`, fkError.message);
        }
      }
      
      console.log(`✅ Added assigned_to column to table: ${tableName}`);
      return true;
    } else {
      // Column exists, check if foreign key is correct (should reference customers, not users)
      try {
        const [fkCheck] = await connection.query(
          `SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
           FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
           WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = ? 
           AND COLUMN_NAME = 'assigned_to' 
           AND REFERENCED_TABLE_NAME IS NOT NULL`,
          [tableName]
        );

        if (fkCheck.length > 0 && fkCheck[0].REFERENCED_TABLE_NAME === 'users') {
          // Drop the wrong foreign key
          const fkName = fkCheck[0].CONSTRAINT_NAME;
          await connection.query(`ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${fkName}\``);
          // Add correct foreign key
          await connection.query(`ALTER TABLE \`${tableName}\` 
            ADD FOREIGN KEY (assigned_to) REFERENCES customers(id) ON DELETE SET NULL`);
          console.log(`✅ Updated assigned_to foreign key to reference customers in ${tableName}`);
        }
      } catch (fkUpdateError) {
        console.warn(`Could not update foreign key for assigned_to in ${tableName}:`, fkUpdateError.message);
      }
    }
    return false;
  } catch (error) {
    console.error(`Error adding assigned_to column to ${tableName}:`, error);
    throw error;
  }
};

/**
 * Add service_reference_id column to existing table if it doesn't exist
 */
export const addServiceReferenceIdColumnIfMissing = async (connection, tableName) => {
  try {
    // Check if service_reference_id column exists
    const [columns] = await connection.query(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = ? 
       AND COLUMN_NAME = 'service_reference_id'`,
      [tableName]
    );

    // If service_reference_id column doesn't exist, add it
    if (columns.length === 0) {
      const alterSQL = `ALTER TABLE \`${tableName}\` 
        ADD COLUMN service_reference_id VARCHAR(20) UNIQUE 
        AFTER id,
        ADD INDEX idx_service_reference_id (service_reference_id)`;
      
      await connection.query(alterSQL);
      console.log(`✅ Added service_reference_id column to table: ${tableName}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error adding service_reference_id column to ${tableName}:`, error);
    throw error;
  }
};

/**
 * Add customer_id column to existing table if it doesn't exist
 */
export const addCustomerIdColumnIfMissing = async (connection, tableName) => {
  try {
    // Check if customer_id column exists
    const [columns] = await connection.query(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = ? 
       AND COLUMN_NAME = 'customer_id'`,
      [tableName]
    );

    // If customer_id column doesn't exist, add it
    if (columns.length === 0) {
      // Add customer_id after service_reference_id column
      const alterSQL = `ALTER TABLE \`${tableName}\` 
        ADD COLUMN customer_id INT NOT NULL 
        AFTER service_reference_id,
        ADD INDEX idx_customer_id (customer_id),
        ADD FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE`;
      
      await connection.query(alterSQL);
      console.log(`✅ Added customer_id column to table: ${tableName}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error adding customer_id column to ${tableName}:`, error);
    throw error;
  }
};

