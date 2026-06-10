-- Add misc_fee to sessions table
ALTER TABLE sessions ADD COLUMN misc_fee numeric(10,2) DEFAULT 0;
