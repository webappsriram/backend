import pool from '../config/database.js';
import { getServiceTableName, sanitizeTableName, addCustomerIdColumnIfMissing, addServiceReferenceIdColumnIfMissing, generateServiceReferenceId } from '../utils/dynamicTable.js';

/**
 * Add a service to a customer
 * Creates a record in the service's dynamic table
 */
export const addServiceToCustomer = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const { customerId } = req.params;
    const userId = req.user.id;
    const { serviceId, ...dynamicFields } = req.body;

    // Validate required fields
    if (!serviceId) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Service ID is required'
      });
    }

    // Verify customer exists
    const [customers] = await connection.execute(
      'SELECT id FROM customers WHERE id = ? AND is_deleted = FALSE',
      [customerId]
    );

    if (customers.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Get service details to find the table name
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

    // Ensure customer_id column exists (for existing tables)
    await addCustomerIdColumnIfMissing(connection, tableName);
    
    // Ensure service_reference_id column exists (for existing tables)
    await addServiceReferenceIdColumnIfMissing(connection, tableName);

    // Generate service reference ID
    const serviceReferenceId = await generateServiceReferenceId(connection, tableName, service.name);

    // Build the INSERT query dynamically based on form schema
    const columns = ['service_reference_id', 'customer_id', 'created_by'];
    const values = [serviceReferenceId, customerId, userId];
    const placeholders = ['?', '?', '?'];

    // Add dynamic fields from form schema
    if (formSchema && formSchema.fields && Array.isArray(formSchema.fields)) {
      formSchema.fields.forEach(field => {
        const fieldName = sanitizeTableName(field.name);
        let fieldValue = dynamicFields[field.name] !== undefined ? dynamicFields[field.name] : (field.defaultValue || null);
        
        // Convert all values to string for storage (field type is only for validation/UI)
        // Convert empty strings to NULL to handle existing columns with strict types (DATE, etc.)
        if (fieldValue === null || fieldValue === undefined) {
          fieldValue = null;
        } else {
          const stringValue = String(fieldValue).trim();
          // Convert empty strings to NULL to handle existing columns with strict types
          fieldValue = stringValue === '' ? null : stringValue;
        }
        
        columns.push(`\`${fieldName}\``);
        values.push(fieldValue);
        placeholders.push('?');
      });
    }

    // Insert the record
    const insertSQL = `INSERT INTO \`${tableName}\` (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
    const [result] = await connection.execute(insertSQL, values);

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Service added to customer successfully',
      data: {
        id: result.insertId,
        customerId: parseInt(customerId),
        serviceId: parseInt(serviceId)
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Add service to customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add service to customer',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    connection.release();
  }
};

/**
 * Get all services for a customer
 */
export const getCustomerServices = async (req, res) => {
  try {
    const { customerId } = req.params;

    // Verify customer exists
    const [customers] = await pool.execute(
      'SELECT id FROM customers WHERE id = ? AND is_deleted = FALSE',
      [customerId]
    );

    if (customers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Get all services
    const [services] = await pool.execute(
      'SELECT id, name, description, form_schema FROM services WHERE is_deleted = FALSE ORDER BY name'
    );

    const customerServices = [];

    // For each service, query its dynamic table for records belonging to this customer
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
            console.warn(`Table ${tableName} does not have customer_id column, skipping`);
            continue;
          }

          // Query the table for this customer's records
          const [records] = await pool.execute(
            `SELECT * FROM \`${tableName}\` 
             WHERE customer_id = ? AND is_deleted = FALSE 
             ORDER BY created_on DESC`,
            [customerId]
          );

          // Transform records to include service info
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

            // Fetch commands for this service record
            let commands = [];
            try {
              const [commandRecords] = await pool.execute(
                `SELECT id, command_text, commanded_date, created_on
                 FROM service_commands
                 WHERE customer_service_id = ?
                   AND service_id = ?
                   AND customer_id = ?
                   AND is_deleted = FALSE
                 ORDER BY commanded_date DESC, created_on DESC`,
                [record.id, service.id, customerId]
              );

              commands = commandRecords.map(cmd => ({
                id: cmd.id,
                commandText: cmd.command_text,
                commandedDate: cmd.commanded_date,
                createdOn: cmd.created_on
              }));
            } catch (cmdError) {
              console.warn(`Error fetching commands for record ${record.id}:`, cmdError.message);
            }

            customerServices.push({
              id: record.id,
              serviceId: service.id,
              serviceName: service.name,
              serviceDescription: service.description,
              serviceReferenceId: record.service_reference_id || null,
              commands,
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

    // Apply pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const total = customerServices.length;
    const totalPages = Math.ceil(total / limit);
    
    // Sort by created_on DESC (most recent first)
    customerServices.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
    
    // Apply pagination
    const paginatedServices = customerServices.slice(offset, offset + limit);

    res.json({
      success: true,
      data: {
        services: paginatedServices,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      }
    });
  } catch (error) {
    console.error('Get customer services error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer services',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update a customer service record
 */
export const updateCustomerService = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const { customerId, serviceId, recordId } = req.params;
    const userId = req.user.id;
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

    // Verify record exists and belongs to this customer
    const [existing] = await connection.execute(
      `SELECT id FROM \`${tableName}\` 
       WHERE id = ? AND customer_id = ? AND is_deleted = FALSE`,
      [recordId, customerId]
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

    // Add dynamic fields
    if (formSchema && formSchema.fields && Array.isArray(formSchema.fields)) {
      formSchema.fields.forEach(field => {
        if (dynamicFields[field.name] !== undefined) {
          const fieldName = sanitizeTableName(field.name);
          let fieldValue = dynamicFields[field.name];
          
          // Convert all values to string for storage (field type is only for validation/UI)
          if (fieldValue !== null && fieldValue !== undefined) {
            fieldValue = String(fieldValue);
          }
          
          updates.push(`\`${fieldName}\` = ?`);
          values.push(fieldValue);
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

    values.push(recordId, customerId);

    const updateSQL = `UPDATE \`${tableName}\` 
                       SET ${updates.join(', ')}, modified_on = CURRENT_TIMESTAMP
                       WHERE id = ? AND customer_id = ? AND is_deleted = FALSE`;
    
    await connection.execute(updateSQL, values);
    await connection.commit();

    res.json({
      success: true,
      message: 'Service record updated successfully'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Update customer service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update service record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    connection.release();
  }
};

/**
 * Delete a customer service record (soft delete)
 */
export const deleteCustomerService = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const { customerId, serviceId, recordId } = req.params;

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

    // Soft delete the record
    const [result] = await connection.execute(
      `UPDATE \`${tableName}\` 
       SET is_deleted = TRUE, modified_on = CURRENT_TIMESTAMP
       WHERE id = ? AND customer_id = ? AND is_deleted = FALSE`,
      [recordId, customerId]
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
    console.error('Delete customer service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete service record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    connection.release();
  }
};

