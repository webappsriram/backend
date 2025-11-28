import pool from '../config/database.js';
import { comparePassword, generateToken } from '../utils/auth.js';

/**
 * Login user
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }
    
    // Find user by email (case-insensitive)
    const [users] = await pool.execute(
      'SELECT id, name, email, password, role, profile_photo_url, created_on FROM users WHERE LOWER(email) = LOWER(?) AND is_deleted = FALSE',
      [email]
    );
    
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    const user = users[0];
    
    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user has set their password by checking for password setup token
    // If there's an unused password_setup token, user hasn't set password yet
    const [tokens] = await pool.execute(
      `SELECT id FROM password_reset_tokens 
       WHERE user_id = ? 
         AND token_type = 'password_setup' 
         AND used = FALSE 
         AND expires_at > NOW()`,
      [user.id]
    );

    if (tokens.length > 0) {
      return res.status(401).json({
        success: false,
        message: 'Please set your password using the link sent to your email before logging in'
      });
    }
    
    // Generate JWT token
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    });
    
    // Remove password from response
    delete user.password;
    
    // Return success response
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          profile_photo_url: user.profile_photo_url,
          created_on: user.created_on
        },
        token
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Logout user
 */
export const logout = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Return success response
    res.json({
      success: true,
      message: 'Logout successful'
    });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get current user profile
 */
export const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [users] = await pool.execute(
      'SELECT id, name, email, role, profile_photo_url, created_on, modified_on FROM users WHERE id = ? AND is_deleted = FALSE',
      [userId]
    );
    
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        user: users[0]
      }
    });
    
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update current user profile
 */
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email, profile_photo_url } = req.body;
    
    // Validate input
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required'
      });
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }
    
    // Check if email is already taken by another user
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ? AND is_deleted = FALSE',
      [email, userId]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email is already taken by another user'
      });
    }
    
    // Update user profile
    const updateFields = [];
    const updateValues = [];
    
    if (name) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    
    if (email) {
      updateFields.push('email = ?');
      updateValues.push(email);
    }
    
    if (profile_photo_url !== undefined) {
      updateFields.push('profile_photo_url = ?');
      updateValues.push(profile_photo_url || null);
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }
    
    updateFields.push('modified_on = CURRENT_TIMESTAMP');
    updateValues.push(userId);
    
    await pool.execute(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = ? AND is_deleted = FALSE`,
      updateValues
    );
    
    // Fetch updated user
    const [users] = await pool.execute(
      'SELECT id, name, email, role, profile_photo_url, created_on, modified_on FROM users WHERE id = ? AND is_deleted = FALSE',
      [userId]
    );
    
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: users[0]
      }
    });
    
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

