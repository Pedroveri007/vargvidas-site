USE VARGS;

ALTER TABLE desaparecidos
  ADD COLUMN IF NOT EXISTS found_at DATETIME NULL AFTER data_desaparecimento,
  ADD COLUMN IF NOT EXISTS is_public TINYINT(1) NOT NULL DEFAULT 0 AFTER status;

UPDATE desaparecidos
SET is_public = CASE WHEN status IN ('ATIVO', 'ENCONTRADO') THEN 1 ELSE 0 END;

CREATE TABLE IF NOT EXISTS solicitacoes_reencontro (
  idSolicitacao INT NOT NULL AUTO_INCREMENT,
  desaparecido_id INT NOT NULL,
  usuario_id INT NOT NULL,
  administrador_id INT NULL,
  status ENUM('PENDENTE', 'APROVADA', 'REJEITADA') NOT NULL DEFAULT 'PENDENTE',
  descricao TEXT NULL,
  data_solicitacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_analise DATETIME NULL,
  PRIMARY KEY (idSolicitacao),
  KEY idx_solicitacao_desaparecido (desaparecido_id),
  KEY idx_solicitacao_usuario (usuario_id),
  KEY idx_solicitacao_administrador (administrador_id),
  CONSTRAINT fk_solicitacao_desaparecido FOREIGN KEY (desaparecido_id) REFERENCES desaparecidos (idDesaparecidos),
  CONSTRAINT fk_solicitacao_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (idUsuario),
  CONSTRAINT fk_solicitacao_administrador FOREIGN KEY (administrador_id) REFERENCES usuarios (idUsuario)
) ENGINE=InnoDB;
