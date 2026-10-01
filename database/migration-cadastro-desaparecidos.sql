USE VARGS;

ALTER TABLE desaparecidos
  ADD COLUMN IF NOT EXISTS is_urgent TINYINT(1) NOT NULL DEFAULT 0 AFTER is_public,
  ADD COLUMN IF NOT EXISTS nome_responsavel VARCHAR(100) NULL AFTER is_urgent,
  ADD COLUMN IF NOT EXISTS telefone_responsavel VARCHAR(30) NULL AFTER nome_responsavel,
  ADD COLUMN IF NOT EXISTS email_responsavel VARCHAR(120) NULL AFTER telefone_responsavel;
