-- Moderator accounts must always be private (posts/profile visibility rules).

UPDATE users
SET is_private = TRUE
WHERE COALESCE(is_admin, FALSE) = TRUE;
