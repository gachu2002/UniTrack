-- +goose Up
ALTER TABLE tasks
    ALTER COLUMN deadline TYPE DATE USING deadline::date;

-- +goose Down
ALTER TABLE tasks
    ALTER COLUMN deadline TYPE TIMESTAMPTZ USING deadline::timestamptz;
