import pool from '../config/database.js';
import { generateCreateTableSQL, generateAlterTableSQL, getServiceTableName, addCustomerIdColumnIfMissing, sanitizeTableName } from '../utils/dynamicTable.js';

/**
 * Get all services with pagination
 */
export const getServices = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Get total count
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM services WHERE is_deleted = FALSE`
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Get paginated services
    const [services] = await pool.execute(
      `SELECT id, name, description, base_amount, form_schema, created_on, modified_on
       FROM services 
       WHERE is_deleted = FALSE 
       ORDER BY created_on DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    res.json({
      success: true,
      data: {
        services: services.map(service => ({
          id: service.id,
          name: service.name,
          description: service.description,
          baseAmount: service.base_amount ? parseFloat(service.base_amount) : 0,
          formSchema: service.form_schema ? JSON.parse(service.form_schema) : null,
          createdOn: service.created_on,
          modifiedOn: service.modified_on
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      }
    });
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch services',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get single service by ID
 */
export const getServiceById = async (req, res) => {
  try {
    const { id } = req.params;

    const [services] = await pool.execute(
      `SELECT id, name, description, base_amount, form_schema, created_on, modified_on
       FROM services 
       WHERE id = ? AND is_deleted = FALSE`,
      [id]
    );

    if (services.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    const service = services[0];
    res.json({
      success: true,
      data: {
        service: {
          id: service.id,
          name: service.name,
          description: service.description,
          baseAmount: service.base_amount ? parseFloat(service.base_amount) : 0,
          formSchema: service.form_schema ? JSON.parse(service.form_schema) : null,
          createdOn: service.created_on,
          modifiedOn: service.modified_on
        }
      }
    });
  } catch (error) {
    console.error('Get service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create new service
 */
export const createService = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const userId = req.user.id;
    const { name, description, formSchema, baseAmount } = req.body;

    // Validate required fields
    if (!name) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Service name is required'
      });
    }

    // Validate form schema if provided
    if (formSchema && (!formSchema.fields || !Array.isArray(formSchema.fields))) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Invalid form schema format'
      });
    }

    // Insert service with form schema (no status in services table)
    const formSchemaJSON = formSchema ? JSON.stringify(formSchema) : null;
    const baseAmountValue = baseAmount ? parseFloat(baseAmount) : 0.00;
    const [result] = await connection.execute(
      `INSERT INTO services (name, description, base_amount, form_schema, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [name, description || null, baseAmountValue, formSchemaJSON, userId]
    );

    const serviceId = result.insertId;

    // Always create a separate table for each service
    // Even if no fields are defined, the table will have default columns
    try {
      const { sql, tableName } = generateCreateTableSQL(serviceId, name, formSchema || { fields: [] }, userId);
      await connection.query(sql);
      console.log(`✅ Created separate table for service: ${tableName}`);
      
      // Ensure customer_id column exists
      await addCustomerIdColumnIfMissing(connection, tableName);
    } catch (tableError) {
      console.error('Error creating service table:', tableError);
      await connection.rollback();
      return res.status(500).json({
        success: false,
        message: 'Failed to create service table',
        error: process.env.NODE_ENV === 'development' ? tableError.message : undefined
      });
    }

    await connection.commit();

    // Fetch the created service
    const [services] = await pool.execute(
      `SELECT id, name, description, base_amount, form_schema, created_on, modified_on
       FROM services 
       WHERE id = ?`,
      [result.insertId]
    );

    const service = services[0];
    res.status(201).json({
      success: true,
      message: 'Service created successfully',
      data: {
        service: {
          id: service.id,
          name: service.name,
          description: service.description,
          baseAmount: service.base_amount ? parseFloat(service.base_amount) : 0,
          formSchema: service.form_schema ? JSON.parse(service.form_schema) : null,
          createdOn: service.created_on,
          modifiedOn: service.modified_on
        }
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Create service error:', error);
    
    // Handle duplicate name error
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'Service name already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create service',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    connection.release();
  }
};

/**
 * Update service
 */
export const updateService = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    const { name, description, formSchema, baseAmount } = req.body;

    // Validate required fields
    if (!name) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Service name is required'
      });
    }

    // Validate form schema if provided
    if (formSchema && (!formSchema.fields || !Array.isArray(formSchema.fields))) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Invalid form schema format'
      });
    }

    // Check if service exists and get old name
    const [existing] = await connection.execute(
      'SELECT id, name, form_schema FROM services WHERE id = ? AND is_deleted = FALSE',
      [id]
    );

    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    const oldService = existing[0];
    const serviceId = parseInt(id);
    const oldTableName = getServiceTableName(serviceId, oldService.name);
    const oldFormSchema = oldService.form_schema ? JSON.parse(oldService.form_schema) : null;

    // Update service
    const formSchemaJSON = formSchema ? JSON.stringify(formSchema) : null;
    const baseAmountValue = baseAmount !== undefined ? parseFloat(baseAmount) : null;
    const updateFields = ['name = ?', 'description = ?', 'form_schema = ?'];
    const updateValues = [name, description || null, formSchemaJSON];
    
    if (baseAmountValue !== null) {
      updateFields.push('base_amount = ?');
      updateValues.push(baseAmountValue);
    }
    
    updateValues.push(id);
    await connection.execute(
      `UPDATE services 
       SET ${updateFields.join(', ')}
       WHERE id = ? AND is_deleted = FALSE`,
      updateValues
    );

    // Handle dynamic table updates - each service always has its own table
    const newTableName = getServiceTableName(serviceId, name);
    
    // Check if table exists, if not create it
    try {
      const [tables] = await connection.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [newTableName]
      );

      if (tables.length === 0) {
        // Table doesn't exist, create it
        const { sql } = generateCreateTableSQL(serviceId, name, formSchema || { fields: [] }, req.user.id);
        await connection.query(sql);
        console.log(`✅ Created separate table for service: ${newTableName}`);
      } else {
        // Ensure customer_id column exists
        await addCustomerIdColumnIfMissing(connection, newTableName);
        
        // Check if we need to add new columns
        if (formSchema && formSchema.fields && formSchema.fields.length > 0) {
          if (oldFormSchema && oldFormSchema.fields) {
            const alterStatements = generateAlterTableSQL(newTableName, formSchema.fields, oldFormSchema.fields);
            for (const alterSQL of alterStatements) {
              await connection.query(alterSQL);
            }
            if (alterStatements.length > 0) {
              console.log(`✅ Added ${alterStatements.length} new columns to ${newTableName}`);
            }
          } else {
            // No old schema but table exists, add new columns
            const alterStatements = generateAlterTableSQL(newTableName, formSchema.fields, []);
            for (const alterSQL of alterStatements) {
              await connection.query(alterSQL);
            }
            if (alterStatements.length > 0) {
              console.log(`✅ Added ${alterStatements.length} columns to existing table: ${newTableName}`);
            }
          }
        }
      }
    } catch (tableError) {
      console.error('Error updating service table:', tableError);
      await connection.rollback();
      return res.status(500).json({
        success: false,
        message: 'Failed to update service table',
        error: process.env.NODE_ENV === 'development' ? tableError.message : undefined
      });
    }

    await connection.commit();

    // Fetch the updated service
    const [services] = await pool.execute(
      `SELECT id, name, description, base_amount, form_schema, created_on, modified_on
       FROM services 
       WHERE id = ?`,
      [id]
    );

    const service = services[0];
    res.json({
      success: true,
      message: 'Service updated successfully',
      data: {
        service: {
          id: service.id,
          name: service.name,
          description: service.description,
          baseAmount: service.base_amount ? parseFloat(service.base_amount) : 0,
          formSchema: service.form_schema ? JSON.parse(service.form_schema) : null,
          createdOn: service.created_on,
          modifiedOn: service.modified_on
        }
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Update service error:', error);
    
    // Handle duplicate name error
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'Service name already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update service',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    connection.release();
  }
};

/**
 * Delete service (soft delete)
 */
export const deleteService = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if service exists
    const [existing] = await pool.execute(
      'SELECT id FROM services WHERE id = ? AND is_deleted = FALSE',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Soft delete
    await pool.execute(
      'UPDATE services SET is_deleted = TRUE WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Service deleted successfully'
    });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete service',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all service records from all dynamic tables with customer data
 * Supports search by customer details
 */
export const getAllServiceRecords = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const searchQuery = req.query.search || '';

    // Get all active services
    const [services] = await pool.execute(
      'SELECT id, name, description, base_amount, form_schema FROM services WHERE is_deleted = FALSE ORDER BY name'
    );

    const allServiceRecords = [];

    // For each service, query its dynamic table for all active records
    for (const service of services) {
      const tableName = getServiceTableName(service.id, service.name);
      
      try {
        // Check if table exists
        const [tableCheck] = await pool.execute(
          `SELECT TABLE_NAME 
           FROM INFORMATION_SCHEMA.TABLES 
           WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = ?`,
          [tableName]
        );

        if (tableCheck.length > 0) {
          // Check if customer_id column exists
          const [columns] = await pool.execute(
            `SELECT COLUMN_NAME 
             FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() 
             AND TABLE_NAME = ? 
             AND COLUMN_NAME = 'customer_id'`,
            [tableName]
          );

          // If customer_id doesn't exist, skip this table (old table structure)
          if (columns.length === 0) {
            continue;
          }

          // Build query with customer join and optional search
          let query = `
            SELECT 
              s.*,
              c.id as customer_id,
              c.name as customer_name,
              c.email as customer_email,
              c.phone as customer_phone,
              c.locality as customer_locality,
              c.city as customer_city,
              c.state as customer_state,
              c.gender as customer_gender
            FROM \`${tableName}\` s
            INNER JOIN customers c ON s.customer_id = c.id
            WHERE s.is_deleted = FALSE AND c.is_deleted = FALSE
          `;

          const queryParams = [];

          // Add search filter if provided
          if (searchQuery.trim()) {
            query += ` AND (
              c.name LIKE ? OR 
              c.email LIKE ? OR 
              c.phone LIKE ? OR 
              c.locality LIKE ? OR 
              c.city LIKE ? OR 
              c.state LIKE ?
            )`;
            const searchPattern = `%${searchQuery.trim()}%`;
            queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
          }

          query += ` ORDER BY s.created_on DESC`;

          // Query the table
          const [records] = await pool.execute(query, queryParams);

          // Transform records to include service info and dynamic fields
          for (const record of records) {
            const formSchema = service.form_schema ? JSON.parse(service.form_schema) : null;
            const dynamicData = {};

            // Extract dynamic fields
            if (formSchema && formSchema.fields) {
              formSchema.fields.forEach(field => {
                const fieldName = sanitizeTableName(field.name);
                dynamicData[field.name] = record[fieldName];
              });
            }

            allServiceRecords.push({
              id: record.id,
              serviceId: service.id,
              serviceName: service.name,
              serviceDescription: service.description,
              serviceReferenceId: record.service_reference_id || null,
              customerId: record.customer_id,
              customerName: record.customer_name,
              customerEmail: record.customer_email,
              customerPhone: record.customer_phone,
              customerLocality: record.customer_locality,
              customerCity: record.customer_city,
              customerState: record.customer_state,
              customerGender: record.customer_gender,
              ...dynamicData,
              createdBy: record.created_by,
              createdOn: record.created_on,
              modifiedOn: record.modified_on
            });
          }
        }
      } catch (tableError) {
        // Table doesn't exist or error querying - skip this service
        console.warn(`Table ${tableName} not accessible:`, tableError.message);
        continue;
      }
    }

    // Sort by created_on DESC (most recent first)
    allServiceRecords.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));

    // Apply pagination
    const total = allServiceRecords.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedRecords = allServiceRecords.slice(offset, offset + limit);

    res.json({
      success: true,
      data: {
        serviceRecords: paginatedRecords,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      }
    });
  } catch (error) {
    console.error('Get all service records error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service records',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete a service record from a dynamic table
 */
export const deleteServiceRecord = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const { serviceId, recordId } = req.params;

    // Get service details
    const [services] = await connection.execute(
      'SELECT id, name FROM services WHERE id = ? AND is_deleted = FALSE',
      [serviceId]
    );

    if (services.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    const service = services[0];
    const tableName = getServiceTableName(service.id, service.name);

    // Check if table exists
    const [tableCheck] = await connection.execute(
      `SELECT TABLE_NAME 
       FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = ?`,
      [tableName]
    );

    if (tableCheck.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Service table not found'
      });
    }

    // Soft delete the record
    const [result] = await connection.execute(
      `UPDATE \`${tableName}\` 
       SET is_deleted = TRUE, modified_on = CURRENT_TIMESTAMP
       WHERE id = ? AND is_deleted = FALSE`,
      [recordId]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Service record not found'
      });
    }

    await connection.commit();

    res.json({
      success: true,
      message: 'Service record deleted successfully'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Delete service record error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete service record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    connection.release();
  }
};

/**
 * Get commands for a service record
 */
export const getServiceRecordCommands = async (req, res) => {
  try {
    const { serviceId, recordId } = req.params;

    // Get service details to find customer_id
    const [services] = await pool.execute(
      'SELECT id, name FROM services WHERE id = ? AND is_deleted = FALSE',
      [serviceId]
    );

    if (services.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    const service = services[0];
    const tableName = getServiceTableName(service.id, service.name);

    // Get the record to find customer_id
    const [records] = await pool.execute(
      `SELECT customer_id FROM \`${tableName}\` WHERE id = ? AND is_deleted = FALSE`,
      [recordId]
    );

    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service record not found'
      });
    }

    const customerId = records[0].customer_id;

    // Get commands
    const [commands] = await pool.execute(
      `SELECT id, command_text, commanded_date, created_by, created_on, modified_on
       FROM service_commands
       WHERE customer_service_id = ? 
         AND service_id = ? 
         AND customer_id = ?
         AND is_deleted = FALSE
       ORDER BY commanded_date DESC, created_on DESC`,
      [recordId, serviceId, customerId]
    );

    res.json({
      success: true,
      data: {
        commands: commands.map(cmd => ({
          id: cmd.id,
          commandText: cmd.command_text,
          commandedDate: cmd.commanded_date,
          createdBy: cmd.created_by,
          createdOn: cmd.created_on,
          modifiedOn: cmd.modified_on
        }))
      }
    });
  } catch (error) {
    console.error('Get service record commands error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch commands',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Add commands to a service record
 */
export const addServiceRecordCommands = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const { serviceId, recordId } = req.params;
    const { commands } = req.body; // Array of { commandText }

    if (!commands || !Array.isArray(commands) || commands.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Commands array is required'
      });
    }

    // Get service details to find customer_id
    const [services] = await connection.execute(
      'SELECT id, name FROM services WHERE id = ? AND is_deleted = FALSE',
      [serviceId]
    );

    if (services.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    const service = services[0];
    const tableName = getServiceTableName(service.id, service.name);

    // Get the record to find customer_id and modified_on
    const [records] = await connection.execute(
      `SELECT customer_id, modified_on FROM \`${tableName}\` WHERE id = ? AND is_deleted = FALSE`,
      [recordId]
    );

    if (records.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Service record not found'
      });
    }

    const customerId = records[0].customer_id;
    const userId = req.user.id;

    // Get modified_on date from the service record to use as commanded_date
    const modifiedOn = records[0].modified_on;
    // Extract date part from modified_on timestamp
    const commandedDate = modifiedOn ? new Date(modifiedOn).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    // Insert commands
    const insertedCommands = [];
    for (const command of commands) {
      if (!command.commandText || !command.commandText.trim()) {
        continue; // Skip invalid commands
      }

      const [result] = await connection.execute(
        `INSERT INTO service_commands 
         (customer_service_id, service_id, customer_id, command_text, commanded_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          recordId,
          parseInt(serviceId),
          parseInt(customerId),
          command.commandText.trim(),
          commandedDate,
          userId
        ]
      );

      insertedCommands.push({
        id: result.insertId,
        commandText: command.commandText.trim(),
        commandedDate: commandedDate
      });
    }

    await connection.commit();

    res.json({
      success: true,
      message: 'Commands added successfully',
      data: {
        commands: insertedCommands
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Add service record commands error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add commands',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    connection.release();
  }
};

/**
 * Get a single service record by ID for editing
 */
export const getServiceRecordById = async (req, res) => {
  try {
    const { serviceId, recordId } = req.params;

    // Get service details
    const [services] = await pool.execute(
      'SELECT id, name, description, base_amount, form_schema FROM services WHERE id = ? AND is_deleted = FALSE',
      [serviceId]
    );

    if (services.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    const service = services[0];
    const tableName = getServiceTableName(service.id, service.name);
    const formSchema = service.form_schema ? JSON.parse(service.form_schema) : null;

    // Get the record
    const [records] = await pool.execute(
      `SELECT * FROM \`${tableName}\` WHERE id = ? AND is_deleted = FALSE`,
      [recordId]
    );

    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service record not found'
      });
    }

    const record = records[0];
    const dynamicData = {};

    // Extract dynamic fields
    if (formSchema && formSchema.fields) {
      formSchema.fields.forEach(field => {
        const fieldName = sanitizeTableName(field.name);
        dynamicData[field.name] = record[fieldName];
      });
    }

    // Get customer info
    const [customers] = await pool.execute(
      'SELECT id, name, email, phone FROM customers WHERE id = ? AND is_deleted = FALSE',
      [record.customer_id]
    );

    res.json({
      success: true,
      data: {
        serviceRecord: {
          id: record.id,
          serviceId: service.id,
          serviceName: service.name,
          serviceDescription: service.description,
          serviceReferenceId: record.service_reference_id || null,
          customerId: record.customer_id,
          customerName: customers[0]?.name || '',
          ...dynamicData,
          createdBy: record.created_by,
          createdOn: record.created_on,
          modifiedOn: record.modified_on
        }
      }
    });
  } catch (error) {
    console.error('Get service record error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update a service record
 */
export const updateServiceRecord = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const { serviceId, recordId } = req.params;
    const { ...dynamicFields } = req.body;

    // Get service details
    const [services] = await connection.execute(
      'SELECT id, name, form_schema FROM services WHERE id = ? AND is_deleted = FALSE',
      [serviceId]
    );

    if (services.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    const service = services[0];
    const tableName = getServiceTableName(service.id, service.name);
    const formSchema = service.form_schema ? JSON.parse(service.form_schema) : null;

    // Verify record exists
    const [existing] = await connection.execute(
      `SELECT id FROM \`${tableName}\` WHERE id = ? AND is_deleted = FALSE`,
      [recordId]
    );

    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Service record not found'
      });
    }

    // Build UPDATE query
    const updates = [];
    const values = [];

    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }

    // Add dynamic fields
    if (formSchema && formSchema.fields && Array.isArray(formSchema.fields)) {
      formSchema.fields.forEach(field => {
        if (dynamicFields[field.name] !== undefined) {
          const fieldName = sanitizeTableName(field.name);
          updates.push(`\`${fieldName}\` = ?`);
          values.push(dynamicFields[field.name]);
        }
      });
    }

    if (updates.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    values.push(recordId);

    const updateSQL = `UPDATE \`${tableName}\` 
                       SET ${updates.join(', ')}, modified_on = CURRENT_TIMESTAMP
                       WHERE id = ? AND is_deleted = FALSE`;
    
    await connection.execute(updateSQL, values);
    await connection.commit();

    res.json({
      success: true,
      message: 'Service record updated successfully'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Update service record error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update service record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    connection.release();
  }
};

