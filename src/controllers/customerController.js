import pool from '../config/database.js';

/**
 * Get all customers with pagination
 */
export const getCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Get total count
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM customers WHERE is_deleted = FALSE`
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Get paginated customers
    const [customers] = await pool.execute(
      `SELECT id, name, email, phone, whatsapp_number, gender, dob, address, locality, city, state, zip_code, country, created_on, modified_on
       FROM customers 
       WHERE is_deleted = FALSE 
       ORDER BY created_on DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    res.json({
      success: true,
      data: {
        customers: customers.map(customer => ({
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          whatsappNumber: customer.whatsapp_number,
          gender: customer.gender ? customer.gender.charAt(0).toUpperCase() + customer.gender.slice(1) : null,
          dob: customer.dob,
          address: customer.address,
          locality: customer.locality,
          city: customer.city,
          state: customer.state,
          zipCode: customer.zip_code,
          country: customer.country,
          createdOn: customer.created_on,
          modifiedOn: customer.modified_on
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
    console.error('Get customers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customers',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get single customer by ID
 */
export const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    const [customers] = await pool.execute(
      `SELECT id, name, email, phone, whatsapp_number, gender, dob, address, locality, city, state, zip_code, country, created_on, modified_on
       FROM customers 
       WHERE id = ? AND is_deleted = FALSE`,
      [id]
    );

    if (customers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    const customer = customers[0];
    res.json({
      success: true,
      data: {
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          whatsappNumber: customer.whatsapp_number,
          gender: customer.gender,
          dob: customer.dob,
          address: customer.address,
          locality: customer.locality,
          city: customer.city,
          state: customer.state,
          zipCode: customer.zip_code,
          country: customer.country,
          createdOn: customer.created_on,
          modifiedOn: customer.modified_on
        }
      }
    });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create new customer
 */
export const createCustomer = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      name,
      email,
      phone,
      whatsappNumber,
      gender,
      dob,
      address,
      locality,
      city,
      state,
      zipCode,
      country
    } = req.body;

    // Validate required fields: name, phone, zipCode
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Name is required'
      });
    }

    if (!phone || !phone.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Phone is required'
      });
    }

    if (!zipCode || !zipCode.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Zip Code is required'
      });
    }

    // Validate email format if provided
    if (email && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format'
        });
      }
    }

    // Validate gender if provided
    if (gender && !['male', 'female', 'other'].includes(gender.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid gender. Must be male, female, or other'
      });
    }

    // Insert customer
    const [result] = await pool.execute(
      `INSERT INTO customers 
       (name, email, phone, whatsapp_number, gender, dob, address, locality, city, state, zip_code, country, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        email || null,
        phone,
        whatsappNumber || null,
        gender ? gender.toLowerCase() : null,
        dob || null,
        address || null,
        locality || null,
        city || null,
        state || null,
        zipCode,
        country || null,
        userId
      ]
    );

    // Fetch the created customer
    const [customers] = await pool.execute(
      `SELECT id, name, email, phone, whatsapp_number, gender, dob, address, locality, city, state, zip_code, country, created_on, modified_on
       FROM customers 
       WHERE id = ?`,
      [result.insertId]
    );

    const customer = customers[0];
    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: {
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          whatsappNumber: customer.whatsapp_number,
          gender: customer.gender ? customer.gender.charAt(0).toUpperCase() + customer.gender.slice(1) : null,
          dob: customer.dob,
          address: customer.address,
          locality: customer.locality,
          city: customer.city,
          state: customer.state,
          zipCode: customer.zip_code,
          country: customer.country,
          createdOn: customer.created_on,
          modifiedOn: customer.modified_on
        }
      }
    });
  } catch (error) {
    console.error('Create customer error:', error);
    
    // Handle duplicate entry error (email or phone)
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('phone') || error.message.includes('idx_phone_unique')) {
        return res.status(400).json({
          success: false,
          message: 'Phone number already exists'
        });
      } else if (error.message.includes('email') || error.message.includes('idx_email')) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      } else {
        return res.status(400).json({
          success: false,
          message: 'Duplicate entry. This record already exists'
        });
      }
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create customer',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update customer
 */
export const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      phone,
      whatsappNumber,
      gender,
      dob,
      address,
      locality,
      city,
      state,
      zipCode,
      country
    } = req.body;

    // Validate required fields: name, phone, zipCode
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Name is required'
      });
    }

    if (!phone || !phone.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Phone is required'
      });
    }

    if (!zipCode || !zipCode.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Zip Code is required'
      });
    }

    // Validate email format if provided
    if (email && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format'
        });
      }
    }

    // Validate gender if provided
    if (gender && !['male', 'female', 'other'].includes(gender.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid gender. Must be male, female, or other'
      });
    }

    // Check if customer exists
    const [existing] = await pool.execute(
      'SELECT id FROM customers WHERE id = ? AND is_deleted = FALSE',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Update customer
    await pool.execute(
      `UPDATE customers 
       SET name = ?, email = ?, phone = ?, whatsapp_number = ?, gender = ?, dob = ?, 
           address = ?, locality = ?, city = ?, state = ?, zip_code = ?, country = ?
       WHERE id = ? AND is_deleted = FALSE`,
      [
        name,
        email || null,
        phone,
        whatsappNumber || null,
        gender ? gender.toLowerCase() : null,
        dob || null,
        address || null,
        locality || null,
        city || null,
        state || null,
        zipCode,
        country || null,
        id
      ]
    );

    // Fetch the updated customer
    const [customers] = await pool.execute(
      `SELECT id, name, email, phone, whatsapp_number, gender, dob, address, locality, city, state, zip_code, country, created_on, modified_on
       FROM customers 
       WHERE id = ?`,
      [id]
    );

    const customer = customers[0];
    res.json({
      success: true,
      message: 'Customer updated successfully',
      data: {
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          whatsappNumber: customer.whatsapp_number,
          gender: customer.gender ? customer.gender.charAt(0).toUpperCase() + customer.gender.slice(1) : null,
          dob: customer.dob,
          address: customer.address,
          locality: customer.locality,
          city: customer.city,
          state: customer.state,
          zipCode: customer.zip_code,
          country: customer.country,
          createdOn: customer.created_on,
          modifiedOn: customer.modified_on
        }
      }
    });
  } catch (error) {
    console.error('Update customer error:', error);
    
    // Handle duplicate entry error (email or phone)
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('phone') || error.message.includes('idx_phone_unique')) {
        return res.status(400).json({
          success: false,
          message: 'Phone number already exists'
        });
      } else if (error.message.includes('email') || error.message.includes('idx_email')) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      } else {
        return res.status(400).json({
          success: false,
          message: 'Duplicate entry. This record already exists'
        });
      }
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update customer',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete customer (soft delete)
 */
export const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if customer exists
    const [existing] = await pool.execute(
      'SELECT id FROM customers WHERE id = ? AND is_deleted = FALSE',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Soft delete
    await pool.execute(
      'UPDATE customers SET is_deleted = TRUE WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete customer',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

