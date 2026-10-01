-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: VARGS
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `alertas`
--

DROP TABLE IF EXISTS `alertas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `alertas` (
  `idAlertas` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `estado_id` int(11) NOT NULL,
  `cidade_id` int(11) NOT NULL,
  `descricao` text DEFAULT NULL,
  PRIMARY KEY (`idAlertas`),
  KEY `fk_alertas_usuario` (`usuario_id`),
  KEY `fk_alertas_estado` (`estado_id`),
  KEY `fk_alertas_cidade` (`cidade_id`),
  CONSTRAINT `fk_alertas_cidade` FOREIGN KEY (`cidade_id`) REFERENCES `cidades` (`idCidades`),
  CONSTRAINT `fk_alertas_estado` FOREIGN KEY (`estado_id`) REFERENCES `estados` (`idEstados`),
  CONSTRAINT `fk_alertas_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`idUsuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `avistamentos`
--

DROP TABLE IF EXISTS `avistamentos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `avistamentos` (
  `idAvistamento` int(11) NOT NULL AUTO_INCREMENT,
  `desaparecidos_id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `cidade_id` int(11) NOT NULL,
  `endereco` varchar(255) DEFAULT NULL,
  `data_avistamento` datetime DEFAULT NULL,
  `descricao` text DEFAULT NULL,
  PRIMARY KEY (`idAvistamento`),
  KEY `fk_avistamentos_desaparecido` (`desaparecidos_id`),
  KEY `fk_avistamentos_usuario` (`usuario_id`),
  KEY `fk_avistamentos_cidade` (`cidade_id`),
  CONSTRAINT `fk_avistamentos_cidade` FOREIGN KEY (`cidade_id`) REFERENCES `cidades` (`idCidades`),
  CONSTRAINT `fk_avistamentos_desaparecido` FOREIGN KEY (`desaparecidos_id`) REFERENCES `desaparecidos` (`idDesaparecidos`),
  CONSTRAINT `fk_avistamentos_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`idUsuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `boletim_ocorrencia`
--

DROP TABLE IF EXISTS `boletim_ocorrencia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `boletim_ocorrencia` (
  `idboletim_ocorrencia` int(11) NOT NULL AUTO_INCREMENT,
  `numero_bo` varchar(50) DEFAULT NULL,
  `data_registro` datetime DEFAULT NULL,
  `orgao_registro` varchar(150) DEFAULT NULL,
  `delegacia` varchar(150) DEFAULT NULL,
  `descricao` text DEFAULT NULL,
  PRIMARY KEY (`idboletim_ocorrencia`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cidades`
--

DROP TABLE IF EXISTS `cidades`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cidades` (
  `idCidades` int(11) NOT NULL AUTO_INCREMENT,
  `estado_id` int(11) NOT NULL,
  `nome` varchar(100) NOT NULL,
  PRIMARY KEY (`idCidades`),
  KEY `fk_cidades_estado` (`estado_id`),
  CONSTRAINT `fk_cidades_estado` FOREIGN KEY (`estado_id`) REFERENCES `estados` (`idEstados`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `denuncias`
--

DROP TABLE IF EXISTS `denuncias`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `denuncias` (
  `idDenuncias` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `desaparecidos_id` int(11) NOT NULL,
  `avistamento_id` int(11) DEFAULT NULL,
  `descricao` text DEFAULT NULL,
  `data_denuncia` datetime DEFAULT NULL,
  PRIMARY KEY (`idDenuncias`),
  KEY `fk_denuncias_usuario` (`usuario_id`),
  KEY `fk_denuncias_desaparecido` (`desaparecidos_id`),
  KEY `fk_denuncias_avistamento` (`avistamento_id`),
  CONSTRAINT `fk_denuncias_avistamento` FOREIGN KEY (`avistamento_id`) REFERENCES `avistamentos` (`idAvistamento`),
  CONSTRAINT `fk_denuncias_desaparecido` FOREIGN KEY (`desaparecidos_id`) REFERENCES `desaparecidos` (`idDesaparecidos`),
  CONSTRAINT `fk_denuncias_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`idUsuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `desaparecidos`
--

DROP TABLE IF EXISTS `desaparecidos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `desaparecidos` (
  `idDesaparecidos` int(11) NOT NULL AUTO_INCREMENT,
  `boletim_ocorrencia_id` int(11) NOT NULL,
  `usuario_id` int(11) DEFAULT NULL,
  `nome` varchar(100) NOT NULL,
  `nome_social` varchar(45) DEFAULT NULL,
  `data_nascimento` date DEFAULT NULL,
  `sexo` enum('MASCULINO','FEMININO','OUTRO') DEFAULT NULL,
  `altura` decimal(5,2) DEFAULT NULL,
  `peso` decimal(5,2) DEFAULT NULL,
  `cor_olhos` varchar(45) DEFAULT NULL,
  `cor_cabelo` varchar(45) DEFAULT NULL,
  `cor_pele` varchar(45) DEFAULT NULL,
  `ultima_roupa` text DEFAULT NULL,
  `caracteristicas` text DEFAULT NULL,
  `descricao` text DEFAULT NULL,
  `foto_url` varchar(500) DEFAULT NULL,
  `data_desaparecimento` datetime DEFAULT NULL,
  `found_at` datetime DEFAULT NULL,
  `cidade_id` int(11) DEFAULT NULL,
  `status` enum('PENDENTE','ATIVO','ENCONTRADO','REJEITADO','ARQUIVADO','EXCLUIDO') NOT NULL DEFAULT 'PENDENTE',
  `is_public` tinyint(1) NOT NULL DEFAULT 0,
  `is_urgent` tinyint(1) NOT NULL DEFAULT 0,
  `nome_responsavel` varchar(100) DEFAULT NULL,
  `telefone_responsavel` varchar(30) DEFAULT NULL,
  `email_responsavel` varchar(120) DEFAULT NULL,
  PRIMARY KEY (`idDesaparecidos`),
  KEY `fk_desaparecidos_boletim` (`boletim_ocorrencia_id`),
  KEY `fk_desaparecidos_usuario` (`usuario_id`),
  KEY `fk_desaparecidos_cidade` (`cidade_id`),
  CONSTRAINT `fk_desaparecidos_boletim` FOREIGN KEY (`boletim_ocorrencia_id`) REFERENCES `boletim_ocorrencia` (`idboletim_ocorrencia`),
  CONSTRAINT `fk_desaparecidos_cidade` FOREIGN KEY (`cidade_id`) REFERENCES `cidades` (`idCidades`),
  CONSTRAINT `fk_desaparecidos_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`idUsuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `estados`
--

DROP TABLE IF EXISTS `estados`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `estados` (
  `idEstados` int(11) NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  PRIMARY KEY (`idEstados`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `historico_desaparecido`
--

DROP TABLE IF EXISTS `historico_desaparecido`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `historico_desaparecido` (
  `idHistorico` int(11) NOT NULL AUTO_INCREMENT,
  `desaparecido_id` int(11) NOT NULL,
  `usuario_id` int(11) DEFAULT NULL,
  `acao` enum('CADASTRO','APROVACAO','REJEICAO','SOLICITACAO_REENCONTRO','REENCONTRO_APROVADO','REENCONTRO_REJEITADO','ARQUIVAMENTO','EXCLUSAO') NOT NULL,
  `descricao` text DEFAULT NULL,
  `data_acao` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`idHistorico`),
  KEY `fk_historico_desaparecido` (`desaparecido_id`),
  KEY `fk_historico_usuario` (`usuario_id`),
  CONSTRAINT `fk_historico_desaparecido` FOREIGN KEY (`desaparecido_id`) REFERENCES `desaparecidos` (`idDesaparecidos`),
  CONSTRAINT `fk_historico_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`idUsuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `mensagens_contato`
--

DROP TABLE IF EXISTS `mensagens_contato`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `mensagens_contato` (
  `idMensagens_contato` int(11) NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) DEFAULT NULL,
  `email` varchar(120) DEFAULT NULL,
  `assunto` varchar(150) DEFAULT NULL,
  `mensagem` text DEFAULT NULL,
  PRIMARY KEY (`idMensagens_contato`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `notificacoes`
--

DROP TABLE IF EXISTS `notificacoes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notificacoes` (
  `idNotificacoes` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `alerta_id` int(11) NOT NULL,
  `mensagem` text DEFAULT NULL,
  PRIMARY KEY (`idNotificacoes`),
  KEY `fk_notificacoes_usuario` (`usuario_id`),
  KEY `fk_notificacoes_alerta` (`alerta_id`),
  CONSTRAINT `fk_notificacoes_alerta` FOREIGN KEY (`alerta_id`) REFERENCES `alertas` (`idAlertas`),
  CONSTRAINT `fk_notificacoes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`idUsuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `parceiros`
--

DROP TABLE IF EXISTS `parceiros`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `parceiros` (
  `idParceiros` int(11) NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) DEFAULT NULL,
  `tipo` enum('ONG','EMPRESA','ORGAO_PUBLICO','POLICIA','OUTRO') DEFAULT NULL,
  `telefone` varchar(20) DEFAULT NULL,
  `email` varchar(120) DEFAULT NULL,
  `descricao` text DEFAULT NULL,
  `data_cadastro` datetime DEFAULT NULL,
  PRIMARY KEY (`idParceiros`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `solicitacoes_reencontro`
--

DROP TABLE IF EXISTS `solicitacoes_reencontro`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `solicitacoes_reencontro` (
  `idSolicitacao` int(11) NOT NULL AUTO_INCREMENT,
  `desaparecido_id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `administrador_id` int(11) DEFAULT NULL,
  `status` enum('PENDENTE','APROVADA','REJEITADA') NOT NULL DEFAULT 'PENDENTE',
  `descricao` text DEFAULT NULL,
  `data_solicitacao` datetime NOT NULL DEFAULT current_timestamp(),
  `data_analise` datetime DEFAULT NULL,
  PRIMARY KEY (`idSolicitacao`),
  KEY `idx_solicitacao_desaparecido` (`desaparecido_id`),
  KEY `idx_solicitacao_usuario` (`usuario_id`),
  KEY `idx_solicitacao_administrador` (`administrador_id`),
  CONSTRAINT `fk_solicitacao_administrador` FOREIGN KEY (`administrador_id`) REFERENCES `usuarios` (`idUsuario`),
  CONSTRAINT `fk_solicitacao_desaparecido` FOREIGN KEY (`desaparecido_id`) REFERENCES `desaparecidos` (`idDesaparecidos`),
  CONSTRAINT `fk_solicitacao_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`idUsuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `usuarios`
--

DROP TABLE IF EXISTS `usuarios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `usuarios` (
  `idUsuario` int(11) NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `senha` varchar(255) NOT NULL,
  `telefone` varchar(20) DEFAULT NULL,
  `role` enum('USUARIO','ADMIN') NOT NULL DEFAULT 'USUARIO',
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `totp_secret` varchar(255) DEFAULT NULL,
  `totp_last_counter` bigint(20) unsigned DEFAULT NULL,
  `auth_version` int(10) unsigned NOT NULL DEFAULT 1,
  PRIMARY KEY (`idUsuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

CREATE TABLE `cadastros_pendentes` (
  `idCadastro` int(11) NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `senha` varchar(255) NOT NULL,
  `telefone` varchar(20) DEFAULT NULL,
  `codigo_hash` char(64) NOT NULL,
  `totp_secret` varchar(255) DEFAULT NULL,
  `expira_em` datetime NOT NULL,
  `enviado_em` datetime NOT NULL,
  `tentativas` tinyint(3) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`idCadastro`),
  UNIQUE KEY `uq_cadastros_pendentes_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `avisos_usuarios` (
  `idAviso` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `administrador_id` int(11) NOT NULL,
  `mensagem` text NOT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`idAviso`),
  KEY `idx_avisos_usuario` (`usuario_id`),
  KEY `idx_avisos_administrador` (`administrador_id`),
  CONSTRAINT `fk_avisos_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`idUsuario`),
  CONSTRAINT `fk_avisos_administrador` FOREIGN KEY (`administrador_id`) REFERENCES `usuarios` (`idUsuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping routines for database 'VARGS'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-10 18:00:10
