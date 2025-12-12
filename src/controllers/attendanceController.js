import pool from '../config/database.js';

/**
 * Sign in (check in) for the day
 */
export const signIn = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    // Check if user has already signed in today
    const [existing] = await pool.execute(
      `SELECT id, sign_in_time, sign_out_time 
       FROM attendance 
       WHERE user_id = ? AND date = ? AND is_deleted = FALSE`,
      [userId, today]
    );

    if (existing.length > 0) {
      if (existing[0].sign_in_time) {
        return res.status(400).json({
          success: false,
          message: 'You have already signed in today'
        });
      }
      
      // Update existing record
      await pool.execute(
        `UPDATE attendance 
         SET sign_in_time = NOW(), modified_on = NOW() 
         WHERE id = ?`,
        [existing[0].id]
      );

      return res.json({
        success: true,
        message: 'Signed in successfully',
        data: {
          signInTime: new Date().toISOString()
        }
      });
    }

    // Create new attendance record
    const [result] = await pool.execute(
      `INSERT INTO attendance (user_id, date, sign_in_time, is_deleted)
       VALUES (?, ?, NOW(), FALSE)`,
      [userId, today]
    );

    res.json({
      success: true,
      message: 'Signed in successfully',
      data: {
        id: result.insertId,
        signInTime: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Sign in error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sign in. Please try again.'
    });
  }
};

/**
 * Sign out (check out) for the day
 */
export const signOut = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    // Check if user has signed in today
    const [existing] = await pool.execute(
      `SELECT id, sign_in_time, sign_out_time 
       FROM attendance 
       WHERE user_id = ? AND date = ? AND is_deleted = FALSE`,
      [userId, today]
    );

    if (existing.length === 0 || !existing[0].sign_in_time) {
      return res.status(400).json({
        success: false,
        message: 'Please sign in first before signing out'
      });
    }

    if (existing[0].sign_out_time) {
      return res.status(400).json({
        success: false,
        message: 'You have already signed out today'
      });
    }

    // Update sign out time
    await pool.execute(
      `UPDATE attendance 
       SET sign_out_time = NOW(), modified_on = NOW() 
       WHERE id = ?`,
      [existing[0].id]
    );

    res.json({
      success: true,
      message: 'Signed out successfully',
      data: {
        signOutTime: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Sign out error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sign out. Please try again.'
    });
  }
};

/**
 * Get today's attendance status
 */
export const getTodayStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    const [attendance] = await pool.execute(
      `SELECT id, sign_in_time, sign_out_time 
       FROM attendance 
       WHERE user_id = ? AND date = ? AND is_deleted = FALSE`,
      [userId, today]
    );

    if (attendance.length === 0) {
      return res.json({
        success: true,
        data: {
          isSignedIn: false,
          isSignedOut: false,
          signInTime: null,
          signOutTime: null
        }
      });
    }

    const record = attendance[0];
    res.json({
      success: true,
      data: {
        isSignedIn: !!record.sign_in_time,
        isSignedOut: !!record.sign_out_time,
        signInTime: record.sign_in_time,
        signOutTime: record.sign_out_time
      }
    });
  } catch (error) {
    console.error('Get attendance status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attendance status'
    });
  }
};

