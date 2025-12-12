-- Create form_data table
CREATE TABLE IF NOT EXISTS form_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT DEFAULT NULL,
  service_id INT NOT NULL,
  service_name VARCHAR(255) NOT NULL,
  form_data JSON NOT NULL,
  created_by INT NOT NULL,
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT FALSE,
  INDEX idx_invoice_id (invoice_id),
  INDEX idx_service_id (service_id),
  INDEX idx_service_name (service_name),
  INDEX idx_created_by (created_by),
  INDEX idx_is_deleted (is_deleted),
  INDEX idx_created_on (created_on),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Make invoice_id nullable if table already exists
ALTER TABLE form_data MODIFY COLUMN invoice_id INT DEFAULT NULL;

