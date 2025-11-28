-- Create customers table with all modifications consolidated
CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) DEFAULT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  whatsapp_number VARCHAR(20) DEFAULT NULL,
  gender ENUM('male', 'female', 'other') DEFAULT NULL,
  dob DATE DEFAULT NULL,
  address TEXT DEFAULT NULL,
  locality VARCHAR(255) DEFAULT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  zip_code VARCHAR(20) NOT NULL,
  country VARCHAR(100) NOT NULL,
  created_by INT NOT NULL,
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT FALSE,
  INDEX idx_email (email),
  UNIQUE INDEX idx_phone_unique (phone),
  INDEX idx_city (city),
  INDEX idx_created_by (created_by),
  INDEX idx_is_deleted (is_deleted),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

