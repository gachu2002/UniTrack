-- +goose Up
UPDATE users SET email = lower(email);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
    ON users (lower(email));

CREATE INDEX IF NOT EXISTS invitations_email_lower_idx
    ON invitations (lower(email));

-- +goose Down
DROP INDEX IF EXISTS invitations_email_lower_idx;
DROP INDEX IF EXISTS users_email_lower_unique;
