-- Add misc_fee to sessions table if it doesn't already exist
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='sessions' AND column_name='misc_fee'
    ) THEN 
        ALTER TABLE sessions ADD COLUMN misc_fee numeric(10,2) DEFAULT 0;
    END IF;
END $$;
