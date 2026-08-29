-- Link players to Supabase auth accounts.
-- NULL means the player has no login (guest / manually added).
alter table players add column if not exists auth_id uuid default null;
