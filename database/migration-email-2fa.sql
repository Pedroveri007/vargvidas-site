USE VARGS;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS email_2fa_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER ativo;

UPDATE usuarios
SET email_2fa_enabled=1,totp_secret=NULL,totp_last_counter=NULL
WHERE totp_secret IS NOT NULL;