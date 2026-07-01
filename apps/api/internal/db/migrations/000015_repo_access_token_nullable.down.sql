UPDATE repositories SET access_token = '' WHERE access_token IS NULL;
ALTER TABLE repositories ALTER COLUMN access_token SET NOT NULL;
