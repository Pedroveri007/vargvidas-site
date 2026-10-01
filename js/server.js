require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const multer = require('multer');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

const app = express();
const port = Number(process.env.PORT || 3000);
const databaseName = process.env.DB_NAME || 'VARGS';
const jwtSecret = process.env.JWT_SECRET || 'development-secret-change-me';
const stateNamesByCode = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia',
  RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe',
  TO: 'Tocantins'
};
const uploadDirectory = path.join(__dirname, 'uploads');
const loginChallengeAttempts = new Map();
fs.mkdirSync(uploadDirectory, { recursive: true });
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: databaseName,
  waitForConnections: true,
  connectionLimit: 10
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));
const projectRoot = path.resolve(__dirname, '..');
app.use(express.static(projectRoot));
app.get('/', (req, res) => res.sendFile(path.join(projectRoot, 'Html', 'index.html')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (req, file, callback) => callback(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowed = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, allowed[extension] === file.mimetype);
  }
});

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || '').split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return expected.length === actual.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function tokenFor(user) {
  return jwt.sign({ idUsuario: user.idUsuario, email: user.email, role: user.role, twoFactorVerified: true, authVersion: 1 }, jwtSecret, { expiresIn: '8h' });
}

function encryptTotpSecret(secret) {
  const key = crypto.scryptSync(jwtSecret, 'varg-totp-encryption-v1', 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64url')).join('.');
}

function decryptTotpSecret(encrypted) {
  const [ivPart, tagPart, ciphertextPart] = String(encrypted || '').split('.');
  if (!ivPart || !tagPart || !ciphertextPart) throw new Error('Chave autenticadora inválida.');
  const key = crypto.scryptSync(jwtSecret, 'varg-totp-encryption-v1', 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

function verifyTotp(secret, code, lastCounter = null) {
  if (!/^\d{6}$/.test(String(code || ''))) return null;
  const delta = speakeasy.totp.verifyDelta({
    secret,
    encoding: 'base32',
    token: String(code),
    window: 1
  });
  if (delta === null) return null;
  const counter = Math.floor(Date.now() / 30000) + delta;
  return lastCounter !== null && counter <= Number(lastCounter) ? null : counter;
}

async function authenticatorSetup(secret, email) {
  const generated = speakeasy.otpauthURL({
    secret,
    label: email,
    issuer: 'VARG',
    encoding: 'base32',
    algorithm: 'sha1',
    digits: 6,
    period: 30
  });
  return {
    secret,
    qrCode: await QRCode.toDataURL(generated)
  };
}

function auth(required = true) {
  return async (req, res, next) => {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    let user;
    try {
      user = jwt.verify(token, jwtSecret);
    } catch (_) {
      if (required) return res.status(401).json({ error: 'Não autenticado.' });
      return next();
    }
    try {
      const [rows] = await pool.execute('SELECT ativo,auth_version FROM usuarios WHERE idUsuario=? LIMIT 1', [user.idUsuario]);
      if (!rows[0] || !rows[0].ativo) return res.status(401).json({ error: 'Sessão inválida ou conta desativada.' });
      if (user.twoFactorVerified !== true || Number(user.authVersion) !== Number(rows[0].auth_version)) {
        return res.status(401).json({ error: 'A autenticação em duas etapas não foi concluída. Entre novamente.' });
      }
      req.user = user;
      next();
    } catch (error) {
      console.error('Falha ao verificar sessão:', error);
      res.status(503).json({ error: 'Não foi possível validar a sessão agora.' });
    }
  };
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Acesso restrito.' });
  next();
}

function publicCase(row) {
  const birthDate = row.data_nascimento ? new Date(row.data_nascimento) : null;
  const age = birthDate ? Math.max(0, Math.floor((Date.now() - birthDate.getTime()) / 31557600000)) : null;
  return {
    id: String(row.idDesaparecidos),
    protocol: row.numero_bo || `VARG-${row.idDesaparecidos}`,
    full_name: row.nome,
    nickname: row.nome_social || '',
    age,
    gender: row.sexo === 'MASCULINO' ? 'Masculino' : row.sexo === 'FEMININO' ? 'Feminino' : 'Outro',
    city: row.cidade || '',
    state: row.estado || '',
    disappearance_date: row.data_desaparecimento,
    last_seen_location: row.delegacia || '',
    circumstances: row.descricao || '',
    height_cm: row.altura,
    weight_kg: row.peso,
    eye_color: row.cor_olhos,
    hair_color: row.cor_cabelo,
    skin_color: row.cor_pele,
    clothing: row.ultima_roupa,
    marks: row.caracteristicas,
    status: row.status === 'ATIVO' ? 'active' : row.status === 'ENCONTRADO' ? 'found' : row.status === 'ARQUIVADO' ? 'archived' : row.status === 'EXCLUIDO' ? 'deleted' : 'pending',
    is_urgent: Boolean(row.is_urgent),
    is_public: Boolean(row.is_public),
    views: 0,
    photo_url: row.foto_url || '',
    created_at: row.data_registro,
    owner_id: row.usuario_id
  };
}

function adminCase(row) {
  return {
    ...publicCase(row),
    family_contact_name: row.nome_responsavel || '',
    family_contact_phone: row.telefone_responsavel || '',
    family_contact_email: row.email_responsavel || ''
  };
}

const caseQuery = `SELECT d.*, b.numero_bo, b.data_registro, b.delegacia,
  c.nome AS cidade, e.nome AS estado
  FROM desaparecidos d
  JOIN boletim_ocorrencia b ON b.idboletim_ocorrencia = d.boletim_ocorrencia_id
  LEFT JOIN cidades c ON c.idCidades = d.cidade_id
  LEFT JOIN estados e ON e.idEstados = c.estado_id`;

function caseFilters(query, publicOnly = false) {
  const conditions = publicOnly ? ["d.status IN ('ATIVO','ENCONTRADO')", 'd.is_public=1'] : [];
  const values = [];
  if (query.q) {
    conditions.push('(d.nome LIKE ? OR c.nome LIKE ?)');
    values.push(`%${query.q}%`, `%${query.q}%`);
  }
  if (query.state) {
    const stateInput = String(query.state).trim();
    conditions.push('e.nome=?');
    values.push(stateNamesByCode[stateInput.toUpperCase()] || stateInput);
  }
  if (query.status) {
    const status = { active: 'ATIVO', found: 'ENCONTRADO', pending: 'PENDENTE', rejected: 'REJEITADO', archived: 'ARQUIVADO', deleted: 'EXCLUIDO' }[query.status] || query.status;
    conditions.push('d.status=?'); values.push(status);
  }
  return { where: conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '', values };
}

async function getOrCreateCity(database, cityName, stateName) {
  const city = String(cityName || '').trim();
  const stateInput = String(stateName || '').trim();
  const state = stateNamesByCode[stateInput.toUpperCase()] || stateInput;
  if (!city || !state) return null;
  const [cities] = await database.execute('SELECT c.idCidades FROM cidades c JOIN estados e ON e.idEstados=c.estado_id WHERE c.nome=? AND e.nome=? LIMIT 1', [city, state]);
  if (cities[0]) return cities[0].idCidades;
  const [states] = await database.execute('SELECT idEstados FROM estados WHERE nome=? LIMIT 1', [state]);
  if (!states[0]) return null;
  const [result] = await database.execute('INSERT INTO cidades (estado_id,nome) VALUES (?,?)', [states[0].idEstados, city]);
  return result.insertId;
}

async function insertHistory(connection, caseId, userId, action, description) {
  await connection.execute(
    'INSERT INTO historico_desaparecido (desaparecido_id, usuario_id, acao, descricao) VALUES (?,?,?,?)',
    [caseId, userId || null, action, description || null]
  );
}

async function notifyCaseOwner(connection, caseId, message) {
  const [rows] = await connection.execute(`SELECT d.usuario_id, d.cidade_id, c.estado_id
    FROM desaparecidos d LEFT JOIN cidades c ON c.idCidades=d.cidade_id WHERE d.idDesaparecidos=?`, [caseId]);
  const caseRow = rows[0];
  if (!caseRow?.usuario_id || !caseRow.cidade_id || !caseRow.estado_id) return;
  const [alert] = await connection.execute('INSERT INTO alertas (usuario_id,estado_id,cidade_id,descricao) VALUES (?,?,?,?)', [caseRow.usuario_id, caseRow.estado_id, caseRow.cidade_id, message]);
  await connection.execute('INSERT INTO notificacoes (usuario_id,alerta_id,mensagem) VALUES (?,?,?)', [caseRow.usuario_id, alert.insertId, message]);
}

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log(`Banco de dados conectado: ${databaseName}`);
  } catch (error) {
    console.error(`Banco de dados indisponível: ${error.code || 'erro de conexão'}`);
  }
  app.listen(port, () => console.log(`VARG disponível em http://localhost:${port}`));
}

app.get('/api/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, database: databaseName }); }
  catch (_) { res.status(503).json({ ok: false, error: 'Banco de dados indisponível.' }); }
});

app.post('/api/auth/register', async (req, res) => {
  res.status(410).json({ error: 'Inicie o cadastro e configure um aplicativo autenticador para confirmar sua conta.' });
});

app.post('/api/auth/register/start', async (req, res) => {
  const nome = String(req.body.nome || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const senha = String(req.body.senha || '');
  const telefone = String(req.body.telefone || '').trim();
  if (!nome || nome.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100 || !senha || senha.length < 8 || telefone.length > 20) {
    return res.status(400).json({ error: 'Informe nome, e-mail válido e senha com pelo menos 8 caracteres.' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [users] = await connection.execute('SELECT idUsuario FROM usuarios WHERE LOWER(email)=? AND ativo=1 LIMIT 1', [email]);
    if (users.length) {
      await connection.rollback();
      return res.status(409).json({ error: 'Já existe uma conta ativa com esse e-mail.' });
    }
    const [pending] = await connection.execute('SELECT enviado_em FROM cadastros_pendentes WHERE email=? FOR UPDATE', [email]);
    if (pending[0] && Date.now() - new Date(pending[0].enviado_em).getTime() < 60000) {
      await connection.rollback();
      return res.status(429).json({ error: 'Já existe uma configuração recente para este e-mail. Aguarde um minuto antes de tentar novamente.' });
    }

    const secret = speakeasy.generateSecret({ length: 20 }).base32;
    const encryptedSecret = encryptTotpSecret(secret);
    const setupHash = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await connection.execute(`INSERT INTO cadastros_pendentes (nome,email,senha,telefone,codigo_hash,totp_secret,expira_em,enviado_em,tentativas)
      VALUES (?,?,?,?,?,?,?,NOW(),0)
      ON DUPLICATE KEY UPDATE nome=VALUES(nome),senha=VALUES(senha),telefone=VALUES(telefone),codigo_hash=VALUES(codigo_hash),totp_secret=VALUES(totp_secret),expira_em=VALUES(expira_em),enviado_em=NOW(),tentativas=0`,
    [nome, email, hashPassword(senha), telefone || null, setupHash, encryptedSecret, expiresAt]);
    await connection.commit();

    const setup = await authenticatorSetup(secret, email);
    res.json({
      ok: true,
      email,
      secret: setup.secret,
      qrCode: setup.qrCode,
      expiresInSeconds: 600,
      message: 'Escaneie o QR code em um aplicativo autenticador e informe o código gerado.'
    });
  } catch (error) {
    if (connection) await connection.rollback().catch(rollbackError => console.error('Falha ao desfazer início do cadastro:', rollbackError));
    console.error('Falha ao iniciar cadastro com autenticador:', error);
    res.status(500).json({ error: 'Não foi possível iniciar a configuração do autenticador.' });
  } finally {
    connection?.release();
  }
});

app.post('/api/auth/register/complete', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.codigo || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Informe o e-mail e o código de 6 dígitos do aplicativo autenticador.' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [pendingRows] = await connection.execute('SELECT * FROM cadastros_pendentes WHERE email=? FOR UPDATE', [email]);
    const pending = pendingRows[0];
    if (!pending) {
      await connection.rollback();
      return res.status(400).json({ error: 'Configuração não encontrada. Reinicie o cadastro.' });
    }
    if (new Date(pending.expira_em).getTime() <= Date.now()) {
      await connection.execute('DELETE FROM cadastros_pendentes WHERE email=?', [email]);
      await connection.commit();
      return res.status(400).json({ error: 'A configuração expirou. Reinicie o cadastro.' });
    }
    if (pending.tentativas >= 5) {
      await connection.execute('DELETE FROM cadastros_pendentes WHERE email=?', [email]);
      await connection.commit();
      return res.status(429).json({ error: 'Limite de tentativas atingido. Reinicie o cadastro.' });
    }

    const secret = decryptTotpSecret(pending.totp_secret);
    const counter = verifyTotp(secret, code);
    if (counter === null) {
      await connection.execute('UPDATE cadastros_pendentes SET tentativas=tentativas+1 WHERE email=?', [email]);
      await connection.commit();
      return res.status(400).json({ error: 'Código inválido ou expirado. Confira o horário do dispositivo e tente novamente.' });
    }

    const [existing] = await connection.execute('SELECT idUsuario FROM usuarios WHERE LOWER(email)=? AND ativo=1 LIMIT 1', [email]);
    if (existing.length) {
      await connection.execute('DELETE FROM cadastros_pendentes WHERE email=?', [email]);
      await connection.commit();
      return res.status(409).json({ error: 'Já existe uma conta ativa com esse e-mail.' });
    }
    const [result] = await connection.execute(`INSERT INTO usuarios
      (nome,email,senha,telefone,role,ativo,totp_secret,totp_last_counter)
      VALUES (?,?,?,?,'USUARIO',1,?,?)`,
    [pending.nome, pending.email, pending.senha, pending.telefone, pending.totp_secret, counter]);
    await connection.execute('DELETE FROM cadastros_pendentes WHERE email=?', [email]);
    await connection.commit();
    const user = { idUsuario: result.insertId, email: pending.email, role: 'USUARIO', nome: pending.nome };
    res.status(201).json({ user, token: tokenFor(user) });
  } catch (error) {
    if (connection) await connection.rollback().catch(rollbackError => console.error('Falha ao desfazer confirmação do cadastro:', rollbackError));
    console.error('Falha ao concluir cadastro com autenticador:', error);
    res.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ error: error.code === 'ER_DUP_ENTRY' ? 'Já existe uma conta com esse e-mail.' : 'Falha ao confirmar o cadastro.' });
  } finally {
    connection?.release();
  }
});

app.post('/api/auth/register/request-code', async (req, res) => {
  res.status(410).json({ error: 'O cadastro agora usa um aplicativo autenticador. Inicie a configuração novamente.' });
});

app.post('/api/auth/register/verify-code', async (req, res) => {
  res.status(410).json({ error: 'O cadastro agora usa um aplicativo autenticador. Inicie a configuração novamente.' });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const [rows] = await pool.execute('SELECT idUsuario,nome,email,senha,role,ativo,totp_secret FROM usuarios WHERE LOWER(email)=? LIMIT 1', [email]);
    const row = rows[0];
    if (!row || !row.ativo || !verifyPassword(req.body.senha, row.senha)) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    const user = { idUsuario: row.idUsuario, email: row.email, role: row.role, nome: row.nome };
    const setupRequired = !row.totp_secret;
    const secret = setupRequired ? speakeasy.generateSecret({ length: 20 }).base32 : null;
    const challengeToken = jwt.sign({
      purpose: 'totp-login',
      idUsuario: user.idUsuario,
      setupRequired,
      setupSecret: secret ? encryptTotpSecret(secret) : null
    }, jwtSecret, { expiresIn: '10m' });
    const response = { user, challengeToken, setupRequired, expiresInSeconds: 600 };
    if (secret) Object.assign(response, await authenticatorSetup(secret, email));
    res.json(response);
  } catch (error) {
    console.error('Falha ao iniciar login:', error);
    res.status(500).json({ error: 'Falha ao entrar.' });
  }
});

app.post('/api/auth/login/verify-totp', async (req, res) => {
  const challengeToken = String(req.body.challengeToken || '');
  const code = String(req.body.codigo || '').trim();
  if (!challengeToken || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Informe o código de 6 dígitos do aplicativo autenticador.' });

  let challenge;
  try {
    challenge = jwt.verify(challengeToken, jwtSecret);
    if (challenge.purpose !== 'totp-login') throw new Error('Token purpose mismatch');
  } catch (_) {
    return res.status(401).json({ error: 'A etapa de login expirou. Entre novamente com seu e-mail e senha.' });
  }

  const userId = Number(challenge.idUsuario);
  let attempt = loginChallengeAttempts.get(userId);
  if (!attempt || attempt.expiresAt <= Date.now()) attempt = { count: 0, expiresAt: Date.now() + 10 * 60 * 1000 };
  if (attempt.count >= 5) {
    return res.status(429).json({ error: 'Limite de tentativas atingido. Aguarde 10 minutos antes de iniciar outro login.' });
  }
  attempt.count += 1;
  loginChallengeAttempts.set(userId, attempt);
  if (loginChallengeAttempts.size > 1000) {
    for (const [token, value] of loginChallengeAttempts) {
      if (value.expiresAt <= Date.now()) loginChallengeAttempts.delete(token);
    }
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute('SELECT idUsuario,nome,email,role,ativo,totp_secret,totp_last_counter FROM usuarios WHERE idUsuario=? FOR UPDATE', [challenge.idUsuario]);
    const row = rows[0];
    if (!row || !row.ativo) {
      await connection.rollback();
      return res.status(401).json({ error: 'Conta inativa ou não encontrada.' });
    }

    const setupRequired = Boolean(challenge.setupRequired);
    if (setupRequired && row.totp_secret) {
      await connection.rollback();
      return res.status(409).json({ error: 'O aplicativo autenticador já foi configurado. Entre novamente.' });
    }
    if (!setupRequired && !row.totp_secret) {
      await connection.rollback();
      return res.status(409).json({ error: 'A configuração do autenticador foi alterada. Entre novamente.' });
    }

    const encryptedSecret = setupRequired ? challenge.setupSecret : row.totp_secret;
    const secret = decryptTotpSecret(encryptedSecret);
    const counter = verifyTotp(secret, code, setupRequired ? null : row.totp_last_counter);
    if (counter === null) {
      await connection.rollback();
      return res.status(400).json({ error: 'Código inválido, expirado ou já utilizado. Confira o relógio do dispositivo e tente novamente.' });
    }

    if (setupRequired) {
      await connection.execute('UPDATE usuarios SET totp_secret=?,totp_last_counter=? WHERE idUsuario=? AND totp_secret IS NULL', [encryptedSecret, counter, row.idUsuario]);
    } else {
      const [updated] = await connection.execute('UPDATE usuarios SET totp_last_counter=? WHERE idUsuario=? AND (totp_last_counter IS NULL OR totp_last_counter<?)', [counter, row.idUsuario, counter]);
      if (!updated.affectedRows) {
        await connection.rollback();
        return res.status(400).json({ error: 'Esse código já foi utilizado. Aguarde o próximo código do aplicativo.' });
      }
    }
    await connection.commit();
    loginChallengeAttempts.delete(userId);
    const user = { idUsuario: row.idUsuario, email: row.email, role: row.role, nome: row.nome };
    res.json({ user, token: tokenFor(user) });
  } catch (error) {
    await connection.rollback().catch(rollbackError => console.error('Falha ao desfazer verificação do autenticador:', rollbackError));
    console.error('Falha ao verificar código autenticador:', error);
    res.status(500).json({ error: 'Falha ao verificar o aplicativo autenticador.' });
  } finally {
    connection.release();
  }
});

app.get('/api/states', async (req, res) => {
  try { const [rows] = await pool.query('SELECT idEstados AS id, nome FROM estados ORDER BY nome'); res.json(rows); }
  catch (_) { res.status(500).json({ error: 'Falha ao consultar estados.' }); }
});

app.get('/api/cities', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT c.idCidades AS id, c.nome, e.nome AS estado FROM cidades c JOIN estados e ON e.idEstados=c.estado_id WHERE (? IS NULL OR e.nome=?) ORDER BY c.nome', [req.query.state || null, req.query.state || null]);
    res.json(rows);
  } catch (_) { res.status(500).json({ error: 'Falha ao consultar cidades.' }); }
});

app.post('/api/uploads/case-photo', auth(), (req, res) => {
  imageUpload.single('photo')(req, res, error => {
    if (error || !req.file) return res.status(400).json({ error: 'A foto deve ser JPG, PNG ou WEBP e ter até 5 MB.' });
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });
});

app.get('/api/cases', async (req, res) => {
  try {
    const filter = caseFilters(req.query, true);
    const [rows] = await pool.execute(`${caseQuery}${filter.where} ORDER BY d.idDesaparecidos DESC`, filter.values);
    res.json(rows.map(publicCase));
  } catch (_) { res.status(500).json({ error: 'Falha ao consultar casos.' }); }
});

app.get('/api/cases/:id', auth(false), async (req, res) => {
  try {
    const [rows] = await pool.execute(`${caseQuery} WHERE d.idDesaparecidos=?`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Caso não encontrado.' });
    const isPublic = Boolean(rows[0].is_public) && ['ATIVO', 'ENCONTRADO'].includes(rows[0].status);
    const isOwner = rows[0].status !== 'EXCLUIDO' && req.user && Number(rows[0].usuario_id) === Number(req.user.idUsuario);
    if (!isPublic && !isOwner && req.user?.role !== 'ADMIN') return res.status(404).json({ error: 'Caso não encontrado.' });
    res.json(publicCase(rows[0]));
  } catch (_) { res.status(500).json({ error: 'Falha ao consultar caso.' }); }
});

app.get('/api/me/cases', auth(), async (req, res) => {
  try {
    const [rows] = await pool.execute(`${caseQuery} WHERE d.usuario_id=? AND d.status<>'EXCLUIDO' ORDER BY d.idDesaparecidos DESC`, [req.user.idUsuario]);
    res.json(rows.map(publicCase));
  } catch (_) { res.status(500).json({ error: 'Falha ao consultar seus casos.' }); }
});

app.get('/api/me/notifications', auth(), async (req, res) => {
  try {
    const [rows] = await pool.execute(`SELECT n.idNotificacoes AS id, n.mensagem, a.descricao, a.cidade_id, NULL AS created_at
      FROM notificacoes n JOIN alertas a ON a.idAlertas=n.alerta_id
      WHERE n.usuario_id=?
      UNION ALL
      SELECT v.idAviso AS id, v.mensagem, NULL AS descricao, NULL AS cidade_id, v.criado_em AS created_at
      FROM avisos_usuarios v WHERE v.usuario_id=?
      ORDER BY created_at DESC, id DESC`, [req.user.idUsuario, req.user.idUsuario]);
    res.json(rows);
  } catch (_) { res.status(500).json({ error: 'Falha ao consultar notificações.' }); }
});

app.get('/api/cases/:id/history', auth(false), async (req, res) => {
  try {
    const [allowed] = await pool.execute(`SELECT usuario_id,status,is_public FROM desaparecidos WHERE idDesaparecidos=?
      AND ((status<>'EXCLUIDO' AND (is_public=1 OR usuario_id=?)) OR ?='ADMIN')`,
    [req.params.id, req.user?.idUsuario || null, req.user?.role || '']);
    if (!allowed[0]) return res.status(404).json({ error: 'Caso não encontrado.' });
    const [rows] = await pool.execute(`SELECT h.idHistorico AS id, h.acao, h.descricao, h.data_acao AS created_at, u.nome AS usuario
      FROM historico_desaparecido h LEFT JOIN usuarios u ON u.idUsuario=h.usuario_id WHERE h.desaparecido_id=? ORDER BY h.data_acao`, [req.params.id]);
    res.json(rows);
  } catch (_) { res.status(500).json({ error: 'Falha ao consultar histórico.' }); }
});

app.post('/api/cases', auth(), async (req, res) => {
  const data = req.body;
  if (!data.full_name || !data.disappearance_date || !data.city || !data.state || !data.circumstances) return res.status(400).json({ error: 'Preencha nome, data, cidade, estado e circunstâncias.' });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const cityId = await getOrCreateCity(connection, data.city, data.state);
    if (!cityId) { await connection.rollback(); return res.status(400).json({ error: 'Estado não encontrado. Selecione um estado válido.' }); }
    const [bo] = await connection.execute('INSERT INTO boletim_ocorrencia (numero_bo,data_registro,delegacia,descricao) VALUES (?,?,?,?)', [data.police_report || null, new Date(), data.last_seen_location || null, data.circumstances]);
    const gender = data.gender === 'Masculino' ? 'MASCULINO' : data.gender === 'Feminino' ? 'FEMININO' : 'OUTRO';
    const [result] = await connection.execute(`INSERT INTO desaparecidos
      (boletim_ocorrencia_id,usuario_id,nome,nome_social,data_nascimento,sexo,altura,peso,cor_olhos,cor_cabelo,cor_pele,ultima_roupa,caracteristicas,descricao,foto_url,data_desaparecimento,cidade_id,status,is_urgent,nome_responsavel,telefone_responsavel,email_responsavel)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'PENDENTE',?,?,?,?)`, [bo.insertId, req.user.idUsuario, data.full_name, data.nickname || null, data.birth_date || null, gender, data.height_cm || null, data.weight_kg || null, data.eye_color || null, data.hair_color || null, data.skin_color || null, data.clothing || null, data.marks || null, data.circumstances, data.foto_url || null, data.disappearance_date, cityId, data.is_urgent ? 1 : 0, data.family_contact_name || null, data.family_contact_phone || null, data.family_contact_email || null]);
    await insertHistory(connection, result.insertId, req.user.idUsuario, 'CADASTRO', 'Cadastro recebido e aguardando triagem.');
    const [rows] = await connection.execute(`${caseQuery} WHERE d.idDesaparecidos=?`, [result.insertId]);
    await connection.commit();
    res.status(201).json(publicCase(rows[0]));
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); }
      catch (rollbackError) { console.error('Falha ao desfazer transação do cadastro:', rollbackError); }
    }
    console.error('Falha ao registrar caso:', error);
    res.status(500).json({ error: 'Falha ao registrar caso.' });
  } finally { connection?.release(); }
});

app.post('/api/sightings', auth(), async (req, res) => {
  try {
    const data = req.body;
    const caseId = Number(data.case_id);
    if (!Number.isSafeInteger(caseId) || caseId <= 0) {
      return res.status(400).json({ error: 'Selecione a pessoa desaparecida relacionada ao avistamento.' });
    }
    if (!data.description || !String(data.description).trim()) {
      return res.status(400).json({ error: 'Descreva o que foi observado.' });
    }
    const [cases] = await pool.execute(
      "SELECT idDesaparecidos FROM desaparecidos WHERE idDesaparecidos=? AND status='ATIVO' AND is_public=1 LIMIT 1",
      [caseId]
    );
    if (!cases.length) {
      return res.status(400).json({ error: 'O caso selecionado não está disponível para receber avistamentos.' });
    }
    const cityId = await getOrCreateCity(pool, data.city, data.state);
    if (!cityId) return res.status(400).json({ error: 'Estado não encontrado. Selecione um estado válido.' });
    const [result] = await pool.execute('INSERT INTO avistamentos (desaparecidos_id,usuario_id,cidade_id,endereco,data_avistamento,descricao) VALUES (?,?,?,?,?,?)', [caseId, req.user.idUsuario, cityId, data.location || null, data.sighting_date || new Date(), String(data.description).trim()]);
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    console.error('Falha ao registrar avistamento:', error);
    res.status(500).json({ error: 'Falha ao registrar avistamento.' });
  }
});

app.post('/api/contact', async (req, res) => {
  try { await pool.execute('INSERT INTO mensagens_contato (nome,email,assunto,mensagem) VALUES (?,?,?,?)', [req.body.name, req.body.email, req.body.subject || null, req.body.message]); res.status(201).json({ ok: true }); }
  catch (_) { res.status(500).json({ error: 'Falha ao enviar mensagem.' }); }
});

app.get('/api/stats', async (req, res) => {
  try {
    const [[total]] = await pool.query("SELECT COUNT(*) AS total FROM desaparecidos WHERE status <> 'REJEITADO'");
    const [[active]] = await pool.query("SELECT COUNT(*) AS total FROM desaparecidos WHERE status='ATIVO'");
    const [[found]] = await pool.query("SELECT COUNT(*) AS total FROM desaparecidos WHERE status='ENCONTRADO'");
    const [states] = await pool.query("SELECT e.nome AS estado, COUNT(*) AS total FROM desaparecidos d JOIN cidades c ON c.idCidades=d.cidade_id JOIN estados e ON e.idEstados=c.estado_id WHERE d.status IN ('ATIVO','ENCONTRADO') GROUP BY e.nome");
    res.json({ total: total.total, ativos: active.total, encontrados: found.total, urgentes: 0, porEstado: Object.fromEntries(states.map(row => [row.estado, row.total])), porStatus: { ATIVO: active.total, ENCONTRADO: found.total } });
  } catch (_) { res.status(500).json({ error: 'Falha ao consultar estatísticas.' }); }
});

app.get('/api/admin/cases', auth(), adminOnly, async (req, res) => {
  try { const filter = caseFilters(req.query); const [rows] = await pool.execute(`${caseQuery}${filter.where} ORDER BY d.idDesaparecidos DESC`, filter.values); res.json(rows.map(adminCase)); }
  catch (_) { res.status(500).json({ error: 'Falha ao consultar casos administrativos.' }); }
});

app.get('/api/admin/cases/:id', auth(), adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.execute(`${caseQuery} WHERE d.idDesaparecidos=?`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Caso não encontrado.' });
    res.json(adminCase(rows[0]));
  } catch (_) { res.status(500).json({ error: 'Falha ao consultar o caso administrativo.' }); }
});

async function updateCaseStatus(req, res, status, action, description) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const expected = action === 'APROVACAO' || action === 'REJEICAO' ? 'PENDENTE' : 'ATIVO';
    const foundAt = status === 'ENCONTRADO' ? 'NOW()' : 'found_at';
    const [result] = await connection.execute(`UPDATE desaparecidos SET status=?, is_public=?, found_at=${foundAt} WHERE idDesaparecidos=? AND status=?`, [status, status === 'ATIVO' || status === 'ENCONTRADO' ? 1 : 0, req.params.id, expected]);
    if (!result.affectedRows) { await connection.rollback(); return res.status(404).json({ error: 'Caso não encontrado ou fora do fluxo permitido.' }); }
    await insertHistory(connection, req.params.id, req.user.idUsuario, action, description);
    if (status === 'ENCONTRADO') {
      await connection.execute("UPDATE solicitacoes_reencontro SET status='APROVADA',administrador_id=?,data_analise=NOW() WHERE desaparecido_id=? AND status='PENDENTE'", [req.user.idUsuario, req.params.id]);
    }
    await notifyCaseOwner(connection, req.params.id, description);
    await connection.commit();
    res.json({ ok: true, status });
  } catch (error) {
    await connection.rollback().catch(rollbackError => console.error('Falha ao desfazer atualização do caso:', rollbackError));
    console.error('Falha ao atualizar caso:', error);
    res.status(500).json({ error: 'Falha ao atualizar caso.' });
  }
  finally { connection.release(); }
}

app.put('/api/admin/cases/:id/approve', auth(), adminOnly, (req, res) => updateCaseStatus(req, res, 'ATIVO', 'APROVACAO', 'Caso aprovado e publicado.'));
app.put('/api/admin/cases/:id/reject', auth(), adminOnly, (req, res) => updateCaseStatus(req, res, 'REJEITADO', 'REJEICAO', req.body.reason || 'Caso rejeitado pela administração.'));
app.put('/api/admin/cases/:id/archive', auth(), adminOnly, (req, res) => updateCaseStatus(req, res, 'ARQUIVADO', 'ARQUIVAMENTO', 'Caso arquivado pela administração.'));
app.put('/api/admin/cases/:id/found', auth(), adminOnly, (req, res) => updateCaseStatus(req, res, 'ENCONTRADO', 'REENCONTRO_APROVADO', 'Administração confirmou que a pessoa foi encontrada.'));

app.delete('/api/admin/cases/:id', auth(), adminOnly, async (req, res) => {
  const caseId = Number(req.params.id);
  if (!Number.isSafeInteger(caseId) || caseId <= 0) return res.status(400).json({ error: 'Caso inválido.' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [cases] = await connection.execute('SELECT idDesaparecidos,status FROM desaparecidos WHERE idDesaparecidos=? FOR UPDATE', [caseId]);
    const caseRow = cases[0];
    if (!caseRow || caseRow.status === 'EXCLUIDO') {
      await connection.rollback();
      return res.status(404).json({ error: 'Caso ativo não encontrado.' });
    }
    await connection.execute("UPDATE desaparecidos SET status='EXCLUIDO',is_public=0 WHERE idDesaparecidos=?", [caseId]);
    await connection.execute("UPDATE solicitacoes_reencontro SET status='REJEITADA',administrador_id=?,data_analise=NOW() WHERE desaparecido_id=? AND status='PENDENTE'", [req.user.idUsuario, caseId]);
    await insertHistory(connection, caseId, req.user.idUsuario, 'EXCLUSAO', 'Caso removido da publicação; registros relacionados foram preservados.');
    await notifyCaseOwner(connection, caseId, 'O caso foi removido da publicação pela administração. Os registros foram preservados.');
    await connection.commit();
    res.json({ ok: true, message: 'Caso ocultado do site. Os registros relacionados foram preservados.' });
  } catch (error) {
    await connection.rollback().catch(rollbackError => console.error('Falha ao desfazer ocultação do caso:', rollbackError));
    console.error('Falha ao ocultar caso:', error);
    res.status(500).json({ error: 'Falha ao ocultar caso.' });
  } finally {
    connection.release();
  }
});

app.get('/api/admin/sightings', auth(), adminOnly, async (req, res) => {
  try { const [rows] = await pool.query(`SELECT a.idAvistamento AS id, a.descricao AS description, a.endereco AS location, a.data_avistamento AS sighting_date, d.nome AS case_name, c.nome AS city, e.nome AS state
    FROM avistamentos a JOIN desaparecidos d ON d.idDesaparecidos=a.desaparecidos_id JOIN cidades c ON c.idCidades=a.cidade_id JOIN estados e ON e.idEstados=c.estado_id ORDER BY a.idAvistamento DESC`); res.json(rows); }
  catch (_) { res.status(500).json({ error: 'Falha ao consultar avistamentos.' }); }
});

app.get('/api/admin/denuncias', auth(), adminOnly, async (req, res) => {
  try { const [rows] = await pool.query(`SELECT n.idDenuncias AS id, n.descricao, n.data_denuncia, d.nome AS case_name FROM denuncias n JOIN desaparecidos d ON d.idDesaparecidos=n.desaparecidos_id ORDER BY n.idDenuncias DESC`); res.json(rows); }
  catch (_) { res.status(500).json({ error: 'Falha ao consultar denúncias.' }); }
});

app.get('/api/admin/messages', auth(), adminOnly, async (req, res) => {
  try { const [rows] = await pool.query('SELECT idMensagens_contato AS id,nome AS name,email,assunto AS subject,mensagem AS message FROM mensagens_contato ORDER BY idMensagens_contato DESC'); res.json(rows); }
  catch (_) { res.status(500).json({ error: 'Falha ao consultar mensagens.' }); }
});

app.get('/api/admin/users', auth(), adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT u.idUsuario AS id,u.nome,u.email,COUNT(d.idDesaparecidos) AS cases_count
      FROM usuarios u LEFT JOIN desaparecidos d ON d.usuario_id=u.idUsuario
      WHERE u.ativo=1 AND u.role='USUARIO'
      GROUP BY u.idUsuario,u.nome,u.email ORDER BY u.nome`);
    res.json(rows);
  } catch (error) {
    console.error('Falha ao consultar contas:', error);
    res.status(500).json({ error: 'Falha ao consultar contas.' });
  }
});

app.post('/api/admin/users/:id/notices', auth(), adminOnly, async (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message || message.length > 2000) return res.status(400).json({ error: 'O aviso deve ter entre 1 e 2000 caracteres.' });
  try {
    const [users] = await pool.execute("SELECT idUsuario FROM usuarios WHERE idUsuario=? AND ativo=1 AND role='USUARIO' LIMIT 1", [req.params.id]);
    if (!users.length) return res.status(404).json({ error: 'Conta ativa não encontrada.' });
    const [result] = await pool.execute('INSERT INTO avisos_usuarios (usuario_id,administrador_id,mensagem) VALUES (?,?,?)', [req.params.id, req.user.idUsuario, message]);
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    console.error('Falha ao enviar aviso à conta:', error);
    res.status(500).json({ error: 'Falha ao enviar aviso.' });
  }
});

app.delete('/api/admin/users/:id', auth(), adminOnly, async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Conta inválida.' });
  if (userId === Number(req.user.idUsuario)) return res.status(400).json({ error: 'Não é possível desativar a própria conta administrativa.' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.execute('SELECT idUsuario,role,ativo,email FROM usuarios WHERE idUsuario=? FOR UPDATE', [userId]);
    const user = users[0];
    if (!user || !user.ativo || user.role !== 'USUARIO') {
      await connection.rollback();
      return res.status(404).json({ error: 'Conta de usuário ativa não encontrada.' });
    }
    const anonymizedEmail = `conta-removida-${user.idUsuario}@invalid.local`;
    await connection.execute('UPDATE usuarios SET ativo=0,nome="Conta removida",email=?,senha=?,telefone=NULL WHERE idUsuario=?', [anonymizedEmail, hashPassword(crypto.randomBytes(32).toString('hex')), userId]);
    await connection.execute('DELETE FROM cadastros_pendentes WHERE email=?', [user.email]);
    await connection.commit();
    res.json({ ok: true, message: 'Conta desativada e anonimizada. Casos e históricos foram preservados.' });
  } catch (error) {
    await connection.rollback().catch(rollbackError => console.error('Falha ao desfazer exclusão de conta:', rollbackError));
    console.error('Falha ao desativar conta:', error);
    res.status(500).json({ error: 'Falha ao desativar a conta.' });
  } finally {
    connection.release();
  }
});

app.post('/api/cases/:id/found-request', auth(), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [cases] = await connection.execute("SELECT idDesaparecidos FROM desaparecidos WHERE idDesaparecidos=? AND usuario_id=? AND status='ATIVO' FOR UPDATE", [req.params.id, req.user.idUsuario]);
    if (!cases[0]) { await connection.rollback(); return res.status(404).json({ error: 'Caso ativo não encontrado para este usuário.' }); }
    const [pending] = await connection.execute("SELECT idSolicitacao FROM solicitacoes_reencontro WHERE desaparecido_id=? AND status='PENDENTE' LIMIT 1", [req.params.id]);
    if (pending[0]) { await connection.rollback(); return res.status(409).json({ error: 'Já existe uma solicitação pendente para este caso.' }); }
    const [result] = await connection.execute('INSERT INTO solicitacoes_reencontro (desaparecido_id,usuario_id,descricao) VALUES (?,?,?)', [req.params.id, req.user.idUsuario, req.body.descricao || null]);
    await insertHistory(connection, req.params.id, req.user.idUsuario, 'SOLICITACAO_REENCONTRO', 'Solicitação de reencontro enviada para análise.');
    await connection.commit();
    res.status(201).json({ id: result.insertId, status: 'PENDENTE' });
  } catch (_) { await connection.rollback(); res.status(500).json({ error: 'Falha ao solicitar reencontro.' }); }
  finally { connection.release(); }
});

app.get('/api/admin/found-requests', auth(), adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT s.idSolicitacao AS id, s.desaparecido_id AS case_id, d.nome AS case_name,
      s.usuario_id, u.nome AS requester, s.status, s.descricao, s.data_solicitacao, s.data_analise
      FROM solicitacoes_reencontro s JOIN desaparecidos d ON d.idDesaparecidos=s.desaparecido_id
      JOIN usuarios u ON u.idUsuario=s.usuario_id WHERE s.status='PENDENTE' ORDER BY s.data_solicitacao`);
    res.json(rows);
  } catch (_) { res.status(500).json({ error: 'Falha ao consultar solicitações de reencontro.' }); }
});

async function reviewFoundRequest(req, res, approved) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [requests] = await connection.execute("SELECT desaparecido_id,usuario_id FROM solicitacoes_reencontro WHERE idSolicitacao=? AND status='PENDENTE' FOR UPDATE", [req.params.id]);
    if (!requests[0]) { await connection.rollback(); return res.status(404).json({ error: 'Solicitação pendente não encontrada.' }); }
    const request = requests[0];
    const requestStatus = approved ? 'APROVADA' : 'REJEITADA';
    if (approved) {
      const [updated] = await connection.execute("UPDATE desaparecidos SET status='ENCONTRADO', is_public=1, found_at=NOW() WHERE idDesaparecidos=? AND status='ATIVO'", [request.desaparecido_id]);
      if (!updated.affectedRows) {
        await connection.rollback();
        return res.status(409).json({ error: 'O caso não está mais em busca ativa; atualize a lista e tente novamente.' });
      }
      await connection.execute('UPDATE solicitacoes_reencontro SET status=?, administrador_id=?, data_analise=NOW() WHERE idSolicitacao=?', [requestStatus, req.user.idUsuario, req.params.id]);
      await connection.execute("UPDATE solicitacoes_reencontro SET status='APROVADA',administrador_id=?,data_analise=NOW() WHERE desaparecido_id=? AND status='PENDENTE'", [req.user.idUsuario, request.desaparecido_id]);
      await insertHistory(connection, request.desaparecido_id, req.user.idUsuario, 'REENCONTRO_APROVADO', 'Solicitação aprovada; caso marcado como encontrado.');
      await notifyCaseOwner(connection, request.desaparecido_id, 'A solicitação de reencontro foi aprovada.');
    } else {
      await connection.execute('UPDATE solicitacoes_reencontro SET status=?, administrador_id=?, data_analise=NOW() WHERE idSolicitacao=?', [requestStatus, req.user.idUsuario, req.params.id]);
      await insertHistory(connection, request.desaparecido_id, req.user.idUsuario, 'REENCONTRO_REJEITADO', 'Solicitação de reencontro rejeitada; caso permanece ativo.');
      await notifyCaseOwner(connection, request.desaparecido_id, 'A solicitação de reencontro foi rejeitada; o caso permanece ativo.');
    }
    await connection.commit();
    res.json({ ok: true, status: requestStatus });
  } catch (_) { await connection.rollback(); res.status(500).json({ error: 'Falha ao analisar solicitação.' }); }
  finally { connection.release(); }
}

app.put('/api/admin/found-requests/:id/approve', auth(), adminOnly, (req, res) => reviewFoundRequest(req, res, true));
app.put('/api/admin/found-requests/:id/reject', auth(), adminOnly, (req, res) => reviewFoundRequest(req, res, false));

start();
