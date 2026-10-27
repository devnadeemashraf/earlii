-- name: ServerVersionNum :one
-- The server's major and minor version as one number (180006 for 18.6).
SELECT current_setting('server_version_num')::int AS version_num;
