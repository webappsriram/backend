-- Migration script to move form_data from invoice_items to form_data table
-- This script should be run after create_form_data_table.sql

-- Step 1: Migrate existing form_data from invoice_items to form_data table
INSERT INTO form_data (invoice_id, service_id, service_name, form_data, created_by, is_deleted)
SELECT 
  ii.invoice_id,
  ii.service_id,
  ii.service_name,
  ii.form_data,
  i.created_by,
  FALSE
FROM invoice_items ii
INNER JOIN invoices i ON ii.invoice_id = i.id
WHERE ii.form_data IS NOT NULL 
  AND ii.form_data != 'null'
  AND JSON_VALID(ii.form_data)
  AND NOT EXISTS (
    SELECT 1 FROM form_data fd 
    WHERE fd.invoice_id = ii.invoice_id 
      AND fd.service_id = ii.service_id
      AND fd.is_deleted = FALSE
  );

-- Step 2: Remove form_data column from invoice_items table (optional - can be done later)
-- ALTER TABLE invoice_items DROP COLUMN form_data;

