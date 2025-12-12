import pool from '../config/database.js';

/**
 * Generate unique invoice number
 */
const generateInvoiceNumber = async (connection) => {
  const prefix = 'INV';
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  
  // Get the last invoice number for this month
  const [lastInvoice] = await connection.execute(
    `SELECT invoice_number FROM invoices 
     WHERE invoice_number LIKE ? 
     ORDER BY id DESC LIMIT 1`,
    [`${prefix}-${year}${month}-%`]
  );
  
  let sequence = 1;
  if (lastInvoice.length > 0) {
    const lastNumber = lastInvoice[0].invoice_number;
    const lastSequence = parseInt(lastNumber.split('-')[2]) || 0;
    sequence = lastSequence + 1;
  }
  
  return `${prefix}-${year}${month}-${String(sequence).padStart(4, '0')}`;
};

/**
 * Get all invoices with pagination
 */
export const getInvoices = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let countQuery = `SELECT COUNT(*) as total 
                      FROM invoices i
                      INNER JOIN customers c ON i.customer_id = c.id
                      WHERE i.is_deleted = FALSE`;
    let dataQuery = `SELECT i.id, i.invoice_number, i.customer_id, i.total_amount, i.status, 
                            i.payment_method, i.payment_reference_id,
                            i.created_on, i.modified_on, i.created_by,
                            c.name as customer_name, c.phone as customer_phone,
                            u.name as created_by_name
                     FROM invoices i
                     INNER JOIN customers c ON i.customer_id = c.id
                     LEFT JOIN users u ON i.created_by = u.id
                     WHERE i.is_deleted = FALSE`;

    const queryParams = [];

    if (search) {
      const searchCondition = ` AND (i.invoice_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)`;
      const searchParam = `%${search}%`;
      countQuery += searchCondition;
      dataQuery += searchCondition;
      queryParams.push(searchParam, searchParam, searchParam);
    }

    dataQuery += ` ORDER BY i.created_on DESC LIMIT ? OFFSET ?`;

    // Get total count
    const [countResult] = await pool.execute(countQuery, queryParams);
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Get paginated invoices
    const [invoices] = await pool.execute(dataQuery, [...queryParams, limit, offset]);

    // Get invoice items for each invoice
    const invoiceIds = invoices.map(inv => inv.id);
    let items = [];
    if (invoiceIds.length > 0) {
      const placeholders = invoiceIds.map(() => '?').join(',');
      const [invoiceItems] = await pool.execute(
        `SELECT invoice_id, service_id, service_name, quantity, unit_price, total_price
         FROM invoice_items
         WHERE invoice_id IN (${placeholders})`,
        invoiceIds
      );
      items = invoiceItems;
    }

    // Get form data for each invoice from form_data table
    let formDataByInvoice = {};
    if (invoiceIds.length > 0) {
      const placeholders = invoiceIds.map(() => '?').join(',');
      const [formDataRecords] = await pool.execute(
        `SELECT invoice_id, service_id, service_name, form_data
         FROM form_data
         WHERE invoice_id IN (${placeholders}) AND is_deleted = FALSE`,
        invoiceIds
      );
      
      formDataRecords.forEach(record => {
        if (!formDataByInvoice[record.invoice_id]) {
          formDataByInvoice[record.invoice_id] = {};
        }
        formDataByInvoice[record.invoice_id][record.service_id] = JSON.parse(record.form_data);
      });
    }

    // Group items by invoice_id and attach form data
    const itemsByInvoice = {};
    items.forEach(item => {
      if (!itemsByInvoice[item.invoice_id]) {
        itemsByInvoice[item.invoice_id] = [];
      }
      itemsByInvoice[item.invoice_id].push({
        serviceId: item.service_id,
        serviceName: item.service_name,
        quantity: parseFloat(item.quantity),
        unitPrice: parseFloat(item.unit_price),
        totalPrice: parseFloat(item.total_price),
        formData: formDataByInvoice[item.invoice_id]?.[item.service_id] || null
      });
    });

    res.json({
      success: true,
      data: {
        invoices: invoices.map(invoice => ({
          id: invoice.id,
          invoiceNumber: invoice.invoice_number,
          customerId: invoice.customer_id,
          customerName: invoice.customer_name,
          customerPhone: invoice.customer_phone,
          totalAmount: parseFloat(invoice.total_amount),
          status: invoice.status,
          paymentMethod: invoice.payment_method,
          paymentReferenceId: invoice.payment_reference_id,
          createdBy: invoice.created_by,
          createdByName: invoice.created_by_name || 'Unknown',
          items: itemsByInvoice[invoice.id] || [],
          createdOn: invoice.created_on,
          modifiedOn: invoice.modified_on
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
    console.error('Get invoices error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoices',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get single invoice by ID
 */
export const getInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;

    const [invoices] = await pool.execute(
      `SELECT i.id, i.invoice_number, i.customer_id, i.total_amount, i.status, 
              i.payment_method, i.payment_reference_id,
              i.created_on, i.modified_on,
              c.name as customer_name, c.phone as customer_phone, c.email as customer_email,
              c.address as customer_address, c.city as customer_city, 
              c.state as customer_state, c.zip_code as customer_zip_code
       FROM invoices i
       INNER JOIN customers c ON i.customer_id = c.id
       WHERE i.id = ? AND i.is_deleted = FALSE`,
      [id]
    );

    if (invoices.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    const invoice = invoices[0];

    // Get invoice items
    const [items] = await pool.execute(
      `SELECT id, service_id, service_name, quantity, unit_price, total_price
       FROM invoice_items
       WHERE invoice_id = ?`,
      [id]
    );

    // Get form data from form_data table
    const [formDataRecords] = await pool.execute(
      `SELECT service_id, form_data
       FROM form_data
       WHERE invoice_id = ? AND is_deleted = FALSE`,
      [id]
    );

    // Create a map of service_id to form_data
    const formDataMap = {};
    formDataRecords.forEach(record => {
      formDataMap[record.service_id] = JSON.parse(record.form_data);
    });

    res.json({
      success: true,
      data: {
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoice_number,
          customerId: invoice.customer_id,
          customer: {
            id: invoice.customer_id,
            name: invoice.customer_name,
            phone: invoice.customer_phone,
            email: invoice.customer_email,
            address: invoice.customer_address,
            city: invoice.customer_city,
            state: invoice.customer_state,
            zipCode: invoice.customer_zip_code
          },
          totalAmount: parseFloat(invoice.total_amount),
          status: invoice.status,
          paymentMethod: invoice.payment_method,
          paymentReferenceId: invoice.payment_reference_id,
          items: items.map(item => ({
            id: item.id,
            serviceId: item.service_id,
            serviceName: item.service_name,
            quantity: parseFloat(item.quantity),
            unitPrice: parseFloat(item.unit_price),
            totalPrice: parseFloat(item.total_price),
            formData: formDataMap[item.service_id] || null
          })),
          createdOn: invoice.created_on,
          modifiedOn: invoice.modified_on
        }
      }
    });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoice',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create new invoice
 */
export const createInvoice = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const userId = req.user.id;
    const { customerId, items, status = 'draft' } = req.body;
    let { paymentMethod, paymentReferenceId } = req.body;

    // Validate required fields
    if (!customerId) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'At least one service item is required'
      });
    }

    // Validate status
    if (!['draft', 'pending', 'paid', 'cancelled'].includes(status)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be draft, pending, paid, or cancelled'
      });
    }

    // Validate payment method if status is paid
    if (status === 'paid') {
      if (!paymentMethod || !['Cash', 'Bank Transfer', 'UPI', 'Other'].includes(paymentMethod)) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Payment method is required when status is paid. Must be Cash, Bank Transfer, UPI, or Other'
        });
      }
    } else {
      // Clear payment method if status is not paid
      paymentMethod = null;
      paymentReferenceId = null;
    }

    // Check if customer exists
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

    // Validate and calculate total
    let totalAmount = 0;
    const invoiceItems = [];

    for (const item of items) {
      if (!item.serviceId || !item.serviceName) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Each item must have serviceId and serviceName'
        });
      }

      // Check if service exists
      const [services] = await connection.execute(
        'SELECT id, name FROM services WHERE id = ? AND is_deleted = FALSE',
        [item.serviceId]
      );

      if (services.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: `Service with ID ${item.serviceId} not found`
        });
      }

      const quantity = parseFloat(item.quantity) || 1;
      const unitPrice = parseFloat(item.unitPrice) || 0;
      const totalPrice = quantity * unitPrice;
      const formData = item.formData || null;

      invoiceItems.push({
        serviceId: item.serviceId,
        serviceName: item.serviceName,
        quantity,
        unitPrice,
        totalPrice,
        formData: formData ? JSON.stringify(formData) : null
      });

      totalAmount += totalPrice;
    }

    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber(connection);

    // Create invoice
    const [invoiceResult] = await connection.execute(
      `INSERT INTO invoices (invoice_number, customer_id, total_amount, status, payment_method, payment_reference_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [invoiceNumber, customerId, totalAmount, status, paymentMethod || null, paymentReferenceId || null, userId]
    );

    const invoiceId = invoiceResult.insertId;

    // Insert invoice items (without form_data - it goes to separate table)
    for (const item of invoiceItems) {
      await connection.execute(
        `INSERT INTO invoice_items (invoice_id, service_id, service_name, quantity, unit_price, total_price)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, item.serviceId, item.serviceName, item.quantity, item.unitPrice, item.totalPrice]
      );

      // Insert form data into separate form_data table if it exists
      if (item.formData && Object.keys(item.formData).length > 0) {
        await connection.execute(
          `INSERT INTO form_data (invoice_id, service_id, service_name, form_data, created_by, is_deleted)
           VALUES (?, ?, ?, ?, ?, FALSE)`,
          [invoiceId, item.serviceId, item.serviceName, JSON.stringify(item.formData), userId]
        );
      }
    }

    await connection.commit();

    // Fetch the created invoice
    const [createdInvoices] = await connection.execute(
      `SELECT i.id, i.invoice_number, i.customer_id, i.total_amount, i.status, 
              i.created_on, i.modified_on,
              c.name as customer_name, c.phone as customer_phone
       FROM invoices i
       INNER JOIN customers c ON i.customer_id = c.id
       WHERE i.id = ?`,
      [invoiceId]
    );

    const [createdItems] = await connection.execute(
      `SELECT id, service_id, service_name, quantity, unit_price, total_price
       FROM invoice_items
       WHERE invoice_id = ?`,
      [invoiceId]
    );

    // Get form data from form_data table
    const [formDataRecords] = await connection.execute(
      `SELECT service_id, form_data
       FROM form_data
       WHERE invoice_id = ? AND is_deleted = FALSE`,
      [invoiceId]
    );

    const formDataMap = {};
    formDataRecords.forEach(record => {
      formDataMap[record.service_id] = JSON.parse(record.form_data);
    });

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: {
        invoice: {
          id: createdInvoices[0].id,
          invoiceNumber: createdInvoices[0].invoice_number,
          customerId: createdInvoices[0].customer_id,
          customerName: createdInvoices[0].customer_name,
          customerPhone: createdInvoices[0].customer_phone,
          totalAmount: parseFloat(createdInvoices[0].total_amount),
          status: createdInvoices[0].status,
          items: createdItems.map(item => ({
            id: item.id,
            serviceId: item.service_id,
            serviceName: item.service_name,
            quantity: parseFloat(item.quantity),
            unitPrice: parseFloat(item.unit_price),
            totalPrice: parseFloat(item.total_price),
            formData: formDataMap[item.service_id] || null
          })),
          createdOn: createdInvoices[0].created_on,
          modifiedOn: createdInvoices[0].modified_on
        }
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Create invoice error:', error);
    
    // Handle duplicate invoice number error
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'Invoice number already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create invoice',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    connection.release();
  }
};

/**
 * Update invoice
 */
export const updateInvoice = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { customerId, items, status, paymentMethod, paymentReferenceId } = req.body;

    // Check if invoice exists
    const [existing] = await connection.execute(
      'SELECT id, status FROM invoices WHERE id = ? AND is_deleted = FALSE',
      [id]
    );

    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Validate status if provided
    if (status && !['draft', 'pending', 'paid', 'cancelled'].includes(status)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be draft, pending, paid, or cancelled'
      });
    }

    // Validate payment method if status is paid
    let finalPaymentMethod = null;
    let finalPaymentReferenceId = null;
    if (status === 'paid') {
      if (!paymentMethod || !['Cash', 'Bank Transfer', 'UPI', 'Other'].includes(paymentMethod)) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Payment method is required when status is paid. Must be Cash, Bank Transfer, UPI, or Other'
        });
      }
      finalPaymentMethod = paymentMethod;
      finalPaymentReferenceId = paymentReferenceId || null;
    } else if (status) {
      // Clear payment method if status is changed to non-paid
      finalPaymentMethod = null;
      finalPaymentReferenceId = null;
    } else {
      // If status is not being updated, keep existing payment method if status is still paid
      const currentStatus = existing[0].status;
      if (currentStatus === 'paid') {
        // Keep existing payment method if status remains paid
        const [currentInvoice] = await connection.execute(
          'SELECT payment_method, payment_reference_id FROM invoices WHERE id = ?',
          [id]
        );
        if (currentInvoice.length > 0) {
          finalPaymentMethod = currentInvoice[0].payment_method;
          finalPaymentReferenceId = currentInvoice[0].payment_reference_id;
        }
      }
    }

    let totalAmount = 0;
    let invoiceItems = [];

    // If items are provided, validate and recalculate
    if (items && Array.isArray(items)) {
      if (items.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'At least one service item is required'
        });
      }

      for (const item of items) {
        if (!item.serviceId || !item.serviceName) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: 'Each item must have serviceId and serviceName'
          });
        }

        // Check if service exists
        const [services] = await connection.execute(
          'SELECT id FROM services WHERE id = ? AND is_deleted = FALSE',
          [item.serviceId]
        );

        if (services.length === 0) {
          await connection.rollback();
          return res.status(404).json({
            success: false,
            message: `Service with ID ${item.serviceId} not found`
          });
        }

        const quantity = parseFloat(item.quantity) || 1;
        const unitPrice = parseFloat(item.unitPrice) || 0;
        const totalPrice = quantity * unitPrice;
        const formData = item.formData || null;

        invoiceItems.push({
          serviceId: item.serviceId,
          serviceName: item.serviceName,
          quantity,
          unitPrice,
          totalPrice,
          formData: formData ? JSON.stringify(formData) : null
        });

        totalAmount += totalPrice;
      }
    } else {
      // If items not provided, calculate from existing items
      const [existingItems] = await connection.execute(
        'SELECT quantity, unit_price FROM invoice_items WHERE invoice_id = ?',
        [id]
      );
      totalAmount = existingItems.reduce((sum, item) => {
        return sum + (parseFloat(item.quantity) * parseFloat(item.unit_price));
      }, 0);
    }

    // Update invoice
    const updateFields = [];
    const updateValues = [];

    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }

    if (finalPaymentMethod !== undefined) {
      updateFields.push('payment_method = ?');
      updateValues.push(finalPaymentMethod);
    }

    if (finalPaymentReferenceId !== undefined) {
      updateFields.push('payment_reference_id = ?');
      updateValues.push(finalPaymentReferenceId);
    }

    if (customerId) {
      // Check if customer exists
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

      updateFields.push('customer_id = ?');
      updateValues.push(customerId);
    }

    if (items && Array.isArray(items)) {
      updateFields.push('total_amount = ?');
      updateValues.push(totalAmount);
    }

    if (updateFields.length > 0) {
      updateValues.push(id);
      await connection.execute(
        `UPDATE invoices SET ${updateFields.join(', ')} WHERE id = ? AND is_deleted = FALSE`,
        updateValues
      );
    }

    // Update items if provided
    if (items && Array.isArray(items)) {
      // Delete existing items
      await connection.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [id]);
      
      // Soft delete existing form_data for this invoice
      await connection.execute(
        'UPDATE form_data SET is_deleted = TRUE WHERE invoice_id = ?',
        [id]
      );

      // Insert new items (without form_data - it goes to separate table)
      for (const item of invoiceItems) {
        await connection.execute(
          `INSERT INTO invoice_items (invoice_id, service_id, service_name, quantity, unit_price, total_price)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, item.serviceId, item.serviceName, item.quantity, item.unitPrice, item.totalPrice]
        );

        // Insert form data into separate form_data table if it exists
        if (item.formData && Object.keys(item.formData).length > 0) {
          await connection.execute(
            `INSERT INTO form_data (invoice_id, service_id, service_name, form_data, created_by, is_deleted)
             VALUES (?, ?, ?, ?, ?, FALSE)`,
            [id, item.serviceId, item.serviceName, JSON.stringify(item.formData), req.user.id]
          );
        }
      }
    }

    await connection.commit();

    // Fetch the updated invoice
    const [updatedInvoices] = await connection.execute(
      `SELECT i.id, i.invoice_number, i.customer_id, i.total_amount, i.status, 
              i.created_on, i.modified_on,
              c.name as customer_name, c.phone as customer_phone
       FROM invoices i
       INNER JOIN customers c ON i.customer_id = c.id
       WHERE i.id = ?`,
      [id]
    );

    const [updatedItems] = await connection.execute(
      `SELECT id, service_id, service_name, quantity, unit_price, total_price
       FROM invoice_items
       WHERE invoice_id = ?`,
      [id]
    );

    // Get form data from form_data table
    const [formDataRecords] = await connection.execute(
      `SELECT service_id, form_data
       FROM form_data
       WHERE invoice_id = ? AND is_deleted = FALSE`,
      [id]
    );

    const formDataMap = {};
    formDataRecords.forEach(record => {
      formDataMap[record.service_id] = JSON.parse(record.form_data);
    });

    res.json({
      success: true,
      message: 'Invoice updated successfully',
      data: {
        invoice: {
          id: updatedInvoices[0].id,
          invoiceNumber: updatedInvoices[0].invoice_number,
          customerId: updatedInvoices[0].customer_id,
          customerName: updatedInvoices[0].customer_name,
          customerPhone: updatedInvoices[0].customer_phone,
          totalAmount: parseFloat(updatedInvoices[0].total_amount),
          status: updatedInvoices[0].status,
          items: updatedItems.map(item => ({
            id: item.id,
            serviceId: item.service_id,
            serviceName: item.service_name,
            quantity: parseFloat(item.quantity),
            unitPrice: parseFloat(item.unit_price),
            totalPrice: parseFloat(item.total_price),
            formData: formDataMap[item.service_id] || null
          })),
          createdOn: updatedInvoices[0].created_on,
          modifiedOn: updatedInvoices[0].modified_on
        }
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Update invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update invoice',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    connection.release();
  }
};

/**
 * Delete invoice (soft delete)
 */
export const deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if invoice exists
    const [existing] = await pool.execute(
      'SELECT id FROM invoices WHERE id = ? AND is_deleted = FALSE',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Soft delete
    await pool.execute(
      'UPDATE invoices SET is_deleted = TRUE WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Invoice deleted successfully'
    });
  } catch (error) {
    console.error('Delete invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete invoice',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Search customers by name or phone (for invoice creation)
 */
export const searchCustomers = async (req, res) => {
  try {
    const search = req.query.search || '';
    const limit = parseInt(req.query.limit) || 20;

    if (!search || search.trim().length === 0) {
      return res.json({
        success: true,
        data: {
          customers: []
        }
      });
    }

    const searchParam = `%${search.trim()}%`;
    const [customers] = await pool.execute(
      `SELECT id, name, phone, email, city, state
       FROM customers 
       WHERE is_deleted = FALSE 
         AND (name LIKE ? OR phone LIKE ?)
       ORDER BY name ASC
       LIMIT ?`,
      [searchParam, searchParam, limit]
    );

    res.json({
      success: true,
      data: {
        customers: customers.map(customer => ({
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          city: customer.city,
          state: customer.state
        }))
      }
    });
  } catch (error) {
    console.error('Search customers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search customers',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

