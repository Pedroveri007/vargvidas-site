USE VARGS;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS ativo TINYINT(1) NOT NULL DEFAULT 1 AFTER role,
  ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(255) DEFAULT NULL AFTER ativo,
  ADD COLUMN IF NOT EXISTS totp_last_counter BIGINT UNSIGNED DEFAULT NULL AFTER totp_secret,
  ADD COLUMN IF NOT EXISTS auth_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER totp_last_counter;

CREATE TABLE IF NOT EXISTS cadastros_pendentes (
  idCadastro INT NOT NULL AUTO_INCREMENT,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  senha VARCHAR(255) NOT NULL,
  telefone VARCHAR(20) DEFAULT NULL,
  codigo_hash CHAR(64) NOT NULL,
  totp_secret VARCHAR(255) DEFAULT NULL,
  expira_em DATETIME NOT NULL,
  enviado_em DATETIME NOT NULL,
  tentativas TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (idCadastro),
  UNIQUE KEY uq_cadastros_pendentes_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE cadastros_pendentes
  ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(255) DEFAULT NULL AFTER codigo_hash;

CREATE TABLE IF NOT EXISTS avisos_usuarios (
  idAviso INT NOT NULL AUTO_INCREMENT,
  usuario_id INT NOT NULL,
  administrador_id INT NOT NULL,
  mensagem TEXT NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idAviso),
  KEY idx_avisos_usuario (usuario_id),
  KEY idx_avisos_administrador (administrador_id),
  CONSTRAINT fk_avisos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (idUsuario),
  CONSTRAINT fk_avisos_administrador FOREIGN KEY (administrador_id) REFERENCES usuarios (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
