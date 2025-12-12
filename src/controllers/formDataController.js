import pool from '../config/database.js';

/**
 * Create new form data
 */
export const createFormData = async (req, res) => {
  try {
    const userId = req.user.id;
    const { invoiceId, serviceId, serviceName, formData } = req.body;

    // Validate required fields (invoiceId is optional)
    if (!serviceId || !serviceName || !formData) {
      return res.status(400).json({
        success: false,
        message: 'Service ID, Service Name, and Form Data are required'
      });
    }

    // Validate that invoice exists if invoiceId is provided
    if (invoiceId) {
      const [invoices] = await pool.execute(
        'SELECT id FROM invoices WHERE id = ? AND is_deleted = FALSE',
        [invoiceId]
      );

      if (invoices.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Invoice not found'
        });
      }
    }

    // Validate that service exists
    const [services] = await pool.execute(
      'SELECT id FROM services WHERE id = ? AND is_deleted = FALSE',
      [serviceId]
    );

    if (services.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Validate formData is an object
    if (typeof formData !== 'object' || Array.isArray(formData)) {
      return res.status(400).json({
        success: false,
        message: 'Form data must be an object'
      });
    }

    // Insert form data (invoice_id can be null)
    const [result] = await pool.execute(
      `INSERT INTO form_data (invoice_id, service_id, service_name, form_data, created_by, is_deleted)
       VALUES (?, ?, ?, ?, ?, FALSE)`,
      [invoiceId || null, serviceId, serviceName, JSON.stringify(formData), userId]
    );

    // Fetch the created form data
    const [formDataRecords] = await pool.execute(
      `SELECT id, invoice_id, service_id, service_name, form_data, created_by, created_on, modified_on
       FROM form_data
       WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Form data created successfully',
      data: {
        formData: {
          id: formDataRecords[0].id,
          invoiceId: formDataRecords[0].invoice_id,
          serviceId: formDataRecords[0].service_id,
          serviceName: formDataRecords[0].service_name,
          formData: JSON.parse(formDataRecords[0].form_data),
          createdBy: formDataRecords[0].created_by,
          createdOn: formDataRecords[0].created_on,
          modifiedOn: formDataRecords[0].modified_on
        }
      }
    });
  } catch (error) {
    console.error('Create form data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create form data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all form data with pagination
 */
export const getFormData = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const serviceName = req.query.serviceName || '';

    let countQuery = `SELECT COUNT(*) as total 
                      FROM form_data fd
                      WHERE fd.is_deleted = FALSE`;
    let dataQuery = `SELECT fd.id, fd.invoice_id, fd.service_id, fd.service_name, fd.form_data, 
                            fd.created_by, fd.created_on, fd.modified_on,
                            i.invoice_number, c.name as customer_name, c.phone as customer_phone,
                            u.name as created_by_name
                     FROM form_data fd
                     INNER JOIN invoices i ON fd.invoice_id = i.id
                     INNER JOIN customers c ON i.customer_id = c.id
                     LEFT JOIN users u ON fd.created_by = u.id
                     WHERE fd.is_deleted = FALSE`;

    const queryParams = [];

    // Filter by service name
    if (serviceName) {
      const serviceCondition = ` AND fd.service_name = ?`;
      countQuery += serviceCondition;
      dataQuery += serviceCondition;
      queryParams.push(serviceName);
    }

    // Search in form data values
    if (search) {
      const searchCondition = ` AND (
        fd.service_name LIKE ? OR 
        i.invoice_number LIKE ? OR 
        c.name LIKE ? OR 
        c.phone LIKE ? OR
        JSON_SEARCH(fd.form_data, 'one', ?) IS NOT NULL
      )`;
      const searchParam = `%${search}%`;
      countQuery += searchCondition;
      dataQuery += searchCondition;
      queryParams.push(searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    dataQuery += ` ORDER BY fd.created_on DESC LIMIT ? OFFSET ?`;

    // Get total count
    const [countResult] = await pool.execute(countQuery, queryParams);
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Get paginated form data
    const [formDataRecords] = await pool.execute(dataQuery, [...queryParams, limit, offset]);

    res.json({
      success: true,
      data: {
        formData: formDataRecords.map(record => ({
          id: record.id,
          invoiceId: record.invoice_id,
          invoiceNumber: record.invoice_number,
          customerName: record.customer_name,
          customerPhone: record.customer_phone,
          serviceId: record.service_id,
          serviceName: record.service_name,
          formData: JSON.parse(record.form_data),
          createdBy: record.created_by,
          createdByName: record.created_by_name || 'Unknown',
          createdOn: record.created_on,
          modifiedOn: record.modified_on
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
    console.error('Get form data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch form data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get form data by ID
 */
export const getFormDataById = async (req, res) => {
  try {
    const { id } = req.params;

    const [formDataRecords] = await pool.execute(
      `SELECT fd.id, fd.invoice_id, fd.service_id, fd.service_name, fd.form_data, 
              fd.created_by, fd.created_on, fd.modified_on,
              i.invoice_number, c.name as customer_name, c.phone as customer_phone,
              u.name as created_by_name
       FROM form_data fd
       INNER JOIN invoices i ON fd.invoice_id = i.id
       INNER JOIN customers c ON i.customer_id = c.id
       LEFT JOIN users u ON fd.created_by = u.id
       WHERE fd.id = ? AND fd.is_deleted = FALSE`,
      [id]
    );

    if (formDataRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Form data not found'
      });
    }

    const record = formDataRecords[0];
    res.json({
      success: true,
      data: {
        formData: {
          id: record.id,
          invoiceId: record.invoice_id,
          invoiceNumber: record.invoice_number,
          customerName: record.customer_name,
          customerPhone: record.customer_phone,
          serviceId: record.service_id,
          serviceName: record.service_name,
          formData: JSON.parse(record.form_data),
          createdBy: record.created_by,
          createdByName: record.created_by_name || 'Unknown',
          createdOn: record.created_on,
          modifiedOn: record.modified_on
        }
      }
    });
  } catch (error) {
    console.error('Get form data by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch form data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update form data
 */
export const updateFormData = async (req, res) => {
  try {
    const { id } = req.params;
    const { formData } = req.body;

    // Check if form data exists
    const [existingRecords] = await pool.execute(
      'SELECT id FROM form_data WHERE id = ? AND is_deleted = FALSE',
      [id]
    );

    if (existingRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Form data not found'
      });
    }

    // Validate formData is an object
    if (formData && (typeof formData !== 'object' || Array.isArray(formData))) {
      return res.status(400).json({
        success: false,
        message: 'Form data must be an object'
      });
    }

    // Update form data
    await pool.execute(
      `UPDATE form_data 
       SET form_data = ?, modified_on = CURRENT_TIMESTAMP
       WHERE id = ? AND is_deleted = FALSE`,
      [JSON.stringify(formData), id]
    );

    // Fetch updated form data
    const [updatedRecords] = await pool.execute(
      `SELECT id, invoice_id, service_id, service_name, form_data, created_by, created_on, modified_on
       FROM form_data
       WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Form data updated successfully',
      data: {
        formData: {
          id: updatedRecords[0].id,
          invoiceId: updatedRecords[0].invoice_id,
          serviceId: updatedRecords[0].service_id,
          serviceName: updatedRecords[0].service_name,
          formData: JSON.parse(updatedRecords[0].form_data),
          createdBy: updatedRecords[0].created_by,
          createdOn: updatedRecords[0].created_on,
          modifiedOn: updatedRecords[0].modified_on
        }
      }
    });
  } catch (error) {
    console.error('Update form data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update form data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete form data (soft delete)
 */
export const deleteFormData = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if form data exists
    const [existingRecords] = await pool.execute(
      'SELECT id FROM form_data WHERE id = ? AND is_deleted = FALSE',
      [id]
    );

    if (existingRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Form data not found'
      });
    }

    // Soft delete
    await pool.execute(
      'UPDATE form_data SET is_deleted = TRUE, modified_on = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Form data deleted successfully'
    });
  } catch (error) {
    console.error('Delete form data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete form data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

