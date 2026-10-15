-- SQL Migration: Drop stored third-party credentials
-- Passwords must never be stored in the database.

ALTER TABLE users DROP COLUMN IF EXISTS linkedin_password_encrypted;
ALTER TABLE users DROP COLUMN IF EXISTS linkedin_email;
