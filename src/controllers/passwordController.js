import pool from '../config/database.js';
import { hashPassword, comparePassword } from '../utils/auth.js';
import { generateToken, sendPasswordResetEmail } from '../services/emailService.js';

/**
 * Set password using setup token
 */
export const setPasswordWithToken = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Token and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Find valid token (for password setup)
    const [tokens] = await pool.execute(
      `SELECT prt.id, prt.user_id, prt.token_type, prt.expires_at, prt.used,
              u.id as user_id, u.email, u.name
       FROM password_reset_tokens prt
       INNER JOIN users u ON prt.user_id = u.id
       WHERE prt.token = ? 
         AND prt.token_type = 'password_setup'
         AND prt.used = FALSE
         AND u.is_deleted = FALSE
         AND prt.expires_at > NOW()`,
      [token]
    );

    if (tokens.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    const tokenRecord = tokens[0];
    const userId = tokenRecord.user_id;

    // Check if password is the temporary password (user hasn't set password yet)
    const [users] = await pool.execute(
      'SELECT password FROM users WHERE id = ? AND is_deleted = FALSE',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Hash new password
    const hashedPassword = await hashPassword(password);

    // Update user password
    await pool.execute(
      'UPDATE users SET password = ?, modified_on = CURRENT_TIMESTAMP WHERE id = ?',
      [hashedPassword, userId]
    );

    // Mark token as used
    await pool.execute(
      'UPDATE password_reset_tokens SET used = TRUE WHERE id = ?',
      [tokenRecord.id]
    );

    res.json({
      success: true,
      message: 'Password set successfully. You can now login.'
    });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Verify token validity
 */
export const verifyToken = async (req, res) => {
  try {
    const { token } = req.params;

    // Check for both password_setup and password_reset tokens
    const [tokens] = await pool.execute(
      `SELECT prt.id, prt.user_id, prt.token_type, prt.expires_at, prt.used,
              u.id as user_id, u.email, u.name
       FROM password_reset_tokens prt
       INNER JOIN users u ON prt.user_id = u.id
       WHERE prt.token = ? 
         AND prt.token_type IN ('password_setup', 'password_reset')
         AND prt.used = FALSE
         AND u.is_deleted = FALSE
         AND prt.expires_at > NOW()`,
      [token]
    );

    if (tokens.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    const tokenRecord = tokens[0];

    res.json({
      success: true,
      data: {
        email: tokenRecord.email,
        name: tokenRecord.name,
        tokenType: tokenRecord.token_type
      }
    });
  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify token',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Request password reset (forgot password)
 */
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
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

    // Find user by email
    const [users] = await pool.execute(
      'SELECT id, name, email FROM users WHERE LOWER(email) = LOWER(?) AND is_deleted = FALSE',
      [email]
    );

    // Always return success to prevent email enumeration
    // But only send email if user exists
    if (users.length > 0) {
      const user = users[0];

      // Invalidate any existing unused reset tokens for this user
      await pool.execute(
        `UPDATE password_reset_tokens 
         SET used = TRUE 
         WHERE user_id = ? 
           AND token_type = 'password_reset' 
           AND used = FALSE`,
        [user.id]
      );

      // Generate password reset token
      const resetToken = generateToken();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // Token expires in 24 hours

      // Store token in database
      await pool.execute(
        `INSERT INTO password_reset_tokens (user_id, token, token_type, expires_at) 
         VALUES (?, ?, 'password_reset', ?)`,
        [user.id, resetToken, expiresAt]
      );

      // Send password reset email (async, don't wait)
      sendPasswordResetEmail(email, resetToken, user.name).catch(err => {
        console.error('Failed to send password reset email:', err);
      });
    }

    // Always return success message (security best practice)
    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.'
    });
  } catch (error) {
    console.error('Request password reset error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Reset password using token (for forgot password flow)
 */
export const resetPasswordWithToken = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Token and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Find valid token
    const [tokens] = await pool.execute(
      `SELECT prt.id, prt.user_id, prt.token_type, prt.expires_at, prt.used,
              u.id as user_id, u.email, u.name
       FROM password_reset_tokens prt
       INNER JOIN users u ON prt.user_id = u.id
       WHERE prt.token = ? 
         AND prt.token_type = 'password_reset'
         AND prt.used = FALSE
         AND u.is_deleted = FALSE
         AND prt.expires_at > NOW()`,
      [token]
    );

    if (tokens.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    const tokenRecord = tokens[0];
    const userId = tokenRecord.user_id;

    // Hash new password
    const hashedPassword = await hashPassword(password);

    // Update user password
    await pool.execute(
      'UPDATE users SET password = ?, modified_on = CURRENT_TIMESTAMP WHERE id = ?',
      [hashedPassword, userId]
    );

    // Mark token as used
    await pool.execute(
      'UPDATE password_reset_tokens SET used = TRUE WHERE id = ?',
      [tokenRecord.id]
    );

    res.json({
      success: true,
      message: 'Password reset successfully. You can now login with your new password.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

