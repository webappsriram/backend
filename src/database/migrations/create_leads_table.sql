-- Create leads table
CREATE TABLE IF NOT EXISTS leads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  comments TEXT DEFAULT NULL,
  status ENUM('new', 'contacted', 'qualified', 'converted', 'lost') DEFAULT 'new',
  created_by INT NOT NULL,
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT FALSE,
  INDEX idx_customer_id (customer_id),
  INDEX idx_status (status),
  INDEX idx_created_by (created_by),
  INDEX idx_is_deleted (is_deleted),
  INDEX idx_created_on (created_on),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

