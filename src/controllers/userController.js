import pool from '../config/database.js';
import { hashPassword } from '../utils/auth.js';
import { generateToken, sendPasswordSetupEmail } from '../services/emailService.js';
import crypto from 'node:crypto';

/**
 * Get all users (admin and master_user only)
 */
export const getAllUsers = async (req, res) => {
  try {
    const [users] = await pool.execute(
      `SELECT id, name, email, role, profile_photo_url, created_on, modified_on 
       FROM users 
       WHERE is_deleted = FALSE AND role != 'master_user'
       ORDER BY created_on DESC`
    );

    res.json({
      success: true,
      data: {
        users
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create a new user (admin and master_user only)
 */
export const createUser = async (req, res) => {
  try {
    const { name, email, role } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Validate role (master_user cannot be created through API)
    const validRoles = ['user', 'admin'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be one of: user, admin'
      });
    }

    // Check if email already exists
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND is_deleted = FALSE',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    // Set a temporary password that cannot be used for login
    // User must set password via email link
    const tempPassword = 'TEMP_PASSWORD_' + crypto.randomBytes(16).toString('hex');
    const hashedPassword = await hashPassword(tempPassword);

    // Insert user
    const [result] = await pool.execute(
      `INSERT INTO users (name, email, password, role, is_deleted) 
       VALUES (?, ?, ?, ?, FALSE)`,
      [name, email, hashedPassword, role || 'user']
    );

    const userId = result.insertId;

    // Generate password setup token
    const setupToken = generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Token expires in 24 hours

    // Store token in database
    await pool.execute(
      `INSERT INTO password_reset_tokens (user_id, token, token_type, expires_at) 
       VALUES (?, ?, 'password_setup', ?)`,
      [userId, setupToken, expiresAt]
    );

    // Send password setup email (async, don't wait)
    sendPasswordSetupEmail(email, setupToken, name).catch(err => {
      console.error('Failed to send password setup email:', err);
    });

    // Fetch created user (without password)
    const [newUser] = await pool.execute(
      `SELECT id, name, email, role, profile_photo_url, created_on, modified_on 
       FROM users 
       WHERE id = ?`,
      [userId]
    );

    res.status(201).json({
      success: true,
      message: 'User created successfully. Password setup email has been sent.',
      data: {
        user: newUser[0]
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update a user (admin and master_user only)
 */
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role } = req.body;

    // Check if user exists
    const [users] = await pool.execute(
      'SELECT id FROM users WHERE id = ? AND is_deleted = FALSE',
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Build update query
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }

    if (email !== undefined) {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format'
        });
      }

      // Check if email already exists (excluding current user)
      const [existingUsers] = await pool.execute(
        'SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ? AND is_deleted = FALSE',
        [email, id]
      );

      if (existingUsers.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }

      updates.push('email = ?');
      values.push(email);
    }

    if (role !== undefined) {
      // Validate role (master_user cannot be set through API)
      const validRoles = ['user', 'admin'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role. Must be one of: user, admin'
        });
      }
      updates.push('role = ?');
      values.push(role);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    values.push(id);

    // Update user
    await pool.execute(
      `UPDATE users 
       SET ${updates.join(', ')}, modified_on = CURRENT_TIMESTAMP 
       WHERE id = ? AND is_deleted = FALSE`,
      values
    );

    // Fetch updated user
    const [updatedUser] = await pool.execute(
      `SELECT id, name, email, role, profile_photo_url, created_on, modified_on 
       FROM users 
       WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'User updated successfully',
      data: {
        user: updatedUser[0]
      }
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete a user (soft delete) (admin and master_user only)
 */
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const [users] = await pool.execute(
      'SELECT id FROM users WHERE id = ? AND is_deleted = FALSE',
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Soft delete user
    await pool.execute(
      'UPDATE users SET is_deleted = TRUE, modified_on = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

