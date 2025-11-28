-- Create service_commands table
-- This table stores commands/notes for customer service records
CREATE TABLE IF NOT EXISTS service_commands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_service_id INT NOT NULL,
  service_id INT NOT NULL,
  customer_id INT NOT NULL,
  command_text TEXT NOT NULL,
  commanded_date DATE NOT NULL,
  created_by INT NOT NULL,
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT FALSE,
  INDEX idx_customer_service_id (customer_service_id),
  INDEX idx_service_id (service_id),
  INDEX idx_customer_id (customer_id),
  INDEX idx_commanded_date (commanded_date),
  INDEX idx_created_by (created_by),
  INDEX idx_is_deleted (is_deleted),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

