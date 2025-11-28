import pool from '../config/database.js';
import { getServiceTableName } from '../utils/dynamicTable.js';

/**
 * Add commands to a customer service record
 */
export const addCommandsToService = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const { customerId, serviceId, recordId } = req.params;
    const userId = req.user.id;
    const { commands } = req.body; // Array of { commandText }

    if (!commands || !Array.isArray(commands) || commands.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Commands array is required and must not be empty'
      });
    }

    // Verify the service record exists
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

    // Verify the service record exists and belongs to this customer, and get modified_on
    const [existing] = await connection.execute(
      `SELECT id, modified_on FROM \`${tableName}\` 
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

    // Get modified_on date from the service record to use as commanded_date
    const modifiedOn = existing[0].modified_on;
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

    res.status(201).json({
      success: true,
      message: 'Commands added successfully',
      data: {
        commands: insertedCommands
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Add commands error:', error);
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
 * Get commands for a customer service record
 */
export const getServiceCommands = async (req, res) => {
  try {
    const { customerId, serviceId, recordId } = req.params;

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
    console.error('Get service commands error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch commands',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update a command
 */
export const updateCommand = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const { customerId, serviceId, recordId, commandId } = req.params;
    const { commandText } = req.body;

    if (!commandText || !commandText.trim()) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Command text is required'
      });
    }

    // Verify command exists and belongs to this service record
    const [existing] = await connection.execute(
      `SELECT id FROM service_commands
       WHERE id = ? 
         AND customer_service_id = ?
         AND service_id = ?
         AND customer_id = ?
         AND is_deleted = FALSE`,
      [commandId, recordId, serviceId, customerId]
    );

    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Command not found'
      });
    }

    // Get modified_on from the service record to use as commanded_date
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

    const [serviceRecord] = await connection.execute(
      `SELECT modified_on FROM \`${tableName}\` 
       WHERE id = ? AND customer_id = ? AND is_deleted = FALSE`,
      [recordId, customerId]
    );

    if (serviceRecord.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Service record not found'
      });
    }

    const modifiedOn = serviceRecord[0].modified_on;
    const commandedDate = modifiedOn ? new Date(modifiedOn).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    // Update command (commanded_date is automatically set from service record's modified_on)
    await connection.execute(
      `UPDATE service_commands
       SET command_text = ?, commanded_date = ?, modified_on = CURRENT_TIMESTAMP
       WHERE id = ? AND is_deleted = FALSE`,
      [commandText.trim(), commandedDate, commandId]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'Command updated successfully'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Update command error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update command',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    connection.release();
  }
};

/**
 * Delete a command (soft delete)
 */
export const deleteCommand = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const { customerId, serviceId, recordId, commandId } = req.params;

    // Verify command exists
    const [existing] = await connection.execute(
      `SELECT id FROM service_commands
       WHERE id = ? 
         AND customer_service_id = ?
         AND service_id = ?
         AND customer_id = ?
         AND is_deleted = FALSE`,
      [commandId, recordId, serviceId, customerId]
    );

    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Command not found'
      });
    }

    // Soft delete
    await connection.execute(
      `UPDATE service_commands
       SET is_deleted = TRUE, modified_on = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [commandId]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'Command deleted successfully'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Delete command error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete command',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    connection.release();
  }
};

