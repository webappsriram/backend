import pool from '../config/database.js';

/**
 * Create a new lead
 */
export const createLead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { customerId, comments, status = 'new' } = req.body;

    // Validate required fields
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }

    // Validate status
    if (!['new', 'contacted', 'qualified', 'converted', 'lost'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be new, contacted, qualified, converted, or lost'
      });
    }

    // Check if customer exists
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

    // Check if lead already exists for this customer
    const [existingLeads] = await pool.execute(
      'SELECT id FROM leads WHERE customer_id = ? AND is_deleted = FALSE',
      [customerId]
    );

    if (existingLeads.length > 0) {
      // Update existing lead instead of creating new one
      await pool.execute(
        `UPDATE leads 
         SET comments = ?, status = ?, modified_on = CURRENT_TIMESTAMP
         WHERE customer_id = ? AND is_deleted = FALSE`,
        [comments || null, status, customerId]
      );

      const [updatedLeads] = await pool.execute(
        `SELECT id, customer_id, comments, status, created_on, modified_on
         FROM leads
         WHERE customer_id = ? AND is_deleted = FALSE`,
        [customerId]
      );

      return res.json({
        success: true,
        message: 'Lead updated successfully',
        data: {
          lead: {
            id: updatedLeads[0].id,
            customerId: updatedLeads[0].customer_id,
            comments: updatedLeads[0].comments,
            status: updatedLeads[0].status,
            createdOn: updatedLeads[0].created_on,
            modifiedOn: updatedLeads[0].modified_on
          }
        }
      });
    }

    // Create new lead
    const [result] = await pool.execute(
      `INSERT INTO leads (customer_id, comments, status, created_by)
       VALUES (?, ?, ?, ?)`,
      [customerId, comments || null, status, userId]
    );

    // Fetch the created lead
    const [leads] = await pool.execute(
      `SELECT id, customer_id, comments, status, created_on, modified_on
       FROM leads
       WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Lead created successfully',
      data: {
        lead: {
          id: leads[0].id,
          customerId: leads[0].customer_id,
          comments: leads[0].comments,
          status: leads[0].status,
          createdOn: leads[0].created_on,
          modifiedOn: leads[0].modified_on
        }
      }
    });
  } catch (error) {
    console.error('Create lead error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create lead',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all leads with pagination
 */
export const getLeads = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let countQuery = `SELECT COUNT(*) as total 
                      FROM leads l
                      INNER JOIN customers c ON l.customer_id = c.id
                      WHERE l.is_deleted = FALSE`;
    let dataQuery = `SELECT l.id, l.customer_id, l.comments, l.status, l.created_on, l.modified_on,
                            c.name as customer_name, c.phone as customer_phone, c.email as customer_email
                     FROM leads l
                     INNER JOIN customers c ON l.customer_id = c.id
                     WHERE l.is_deleted = FALSE`;

    const queryParams = [];

    if (search) {
      const searchCondition = ` AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)`;
      const searchParam = `%${search}%`;
      countQuery += searchCondition;
      dataQuery += searchCondition;
      queryParams.push(searchParam, searchParam, searchParam);
    }

    dataQuery += ` ORDER BY l.created_on DESC LIMIT ? OFFSET ?`;

    // Get total count
    const [countResult] = await pool.execute(countQuery, queryParams);
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Get paginated leads
    const [leads] = await pool.execute(dataQuery, [...queryParams, limit, offset]);

    res.json({
      success: true,
      data: {
        leads: leads.map(lead => ({
          id: lead.id,
          customerId: lead.customer_id,
          customerName: lead.customer_name,
          customerPhone: lead.customer_phone,
          customerEmail: lead.customer_email,
          comments: lead.comments,
          status: lead.status,
          createdOn: lead.created_on,
          modifiedOn: lead.modified_on
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
    console.error('Get leads error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leads',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

