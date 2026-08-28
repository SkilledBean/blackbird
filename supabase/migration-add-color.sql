-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
-- Adds a per-player accent color for avatar badges throughout the app.

alter table players add column if not exists color text default null;
