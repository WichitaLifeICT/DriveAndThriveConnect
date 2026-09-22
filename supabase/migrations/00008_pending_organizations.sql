-- Add pending_organizations column for driver org approval flow
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pending_organizations TEXT;
