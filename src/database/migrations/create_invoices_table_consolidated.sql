-- Create invoices table with all modifications consolidated
CREATE TABLE IF NOT EXISTS invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  customer_id INT NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  status ENUM('draft', 'pending', 'paid', 'cancelled') DEFAULT 'draft',
  payment_method ENUM('Cash', 'Bank Transfer', 'UPI', 'Other') DEFAULT NULL,
  payment_reference_id VARCHAR(255) DEFAULT NULL,
  created_by INT NOT NULL,
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT FALSE,
  INDEX idx_invoice_number (invoice_number),
  INDEX idx_customer_id (customer_id),
  INDEX idx_status (status),
  INDEX idx_created_by (created_by),
  INDEX idx_is_deleted (is_deleted),
  INDEX idx_created_on (created_on),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create invoice_items table with all modifications consolidated
CREATE TABLE IF NOT EXISTS invoice_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NOT NULL,
  service_id INT NOT NULL,
  service_name VARCHAR(255) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
  unit_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  total_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  form_data JSON DEFAULT NULL,
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_invoice_id (invoice_id),
  INDEX idx_service_id (service_id),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

