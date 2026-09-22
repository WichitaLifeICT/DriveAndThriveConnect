-- Add email notification preference for drivers
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notify_email BOOLEAN NOT NULL DEFAULT true;
