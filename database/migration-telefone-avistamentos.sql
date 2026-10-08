USE VARGS;

ALTER TABLE desaparecidos
  ADD COLUMN IF NOT EXISTS mostrar_telefone TINYINT(1) NOT NULL DEFAULT 0 AFTER telefone_responsavel;

ALTER TABLE avistamentos
  ADD COLUMN IF NOT EXISTS nome_informante VARCHAR(100) NULL AFTER descricao,
  ADD COLUMN IF NOT EXISTS telefone_informante VARCHAR(30) NULL AFTER nome_informante,
  ADD COLUMN IF NOT EXISTS email_informante VARCHAR(120) NULL AFTER telefone_informante,
  ADD COLUMN IF NOT EXISTS anonimo TINYINT(1) NOT NULL DEFAULT 0 AFTER email_informante;
