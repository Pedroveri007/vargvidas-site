require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const multer = require('multer');

const app = express();
const port = Number(process.env.PORT || 3000);
const databaseName = process.env.DB_NAME || 'VARGS';
const jwtSecret = process.env.JWT_SECRET || 'development-secret-change-me';
const uploadDirectory = path.join(__dirname, 'uploads');
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
app.use(express.static(__dirname));
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
  return jwt.sign({ idUsuario: user.idUsuario, email: user.email, role: user.role }, jwtSecret, { expiresIn: '8h' });
}

function auth(required = true) {
  return (req, res, next) => {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    try {
      req.user = jwt.verify(token, jwtSecret);
      next();
    } catch (_) {
      if (required) return res.status(401).json({ error: 'Não autenticado.' });
      next();
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
    status: row.status === 'ATIVO' ? 'active' : row.status === 'ENCONTRADO' ? 'found' : row.status === 'ARQUIVADO' ? 'archived' : 'pending',
    is_urgent: false,
    is_public: Boolean(row.is_public),
    views: 0,
    photo_url: row.foto_url || '',
    created_at: row.data_registro,
    owner_id: row.usuario_id
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
  if (query.state) { conditions.push('e.nome=?'); values.push(query.state); }
  if (query.status) {
    const status = { active: 'ATIVO', found: 'ENCONTRADO', pending: 'PENDENTE', rejected: 'REJEITADO', archived: 'ARQUIVADO' }[query.status] || query.status;
    conditions.push('d.status=?'); values.push(status);
  }
  return { where: conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '', values };
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
  const { nome, email, senha, telefone } = req.body;
  if (!nome || !email || !senha || String(senha).length < 8) return res.status(400).json({ error: 'Nome, e-mail e senha com pelo menos 8 caracteres são obrigatórios.' });
  try {
    const [result] = await pool.execute('INSERT INTO usuarios (nome,email,senha,telefone) VALUES (?,?,?,?)', [nome, email, hashPassword(senha), telefone || null]);
    const user = { idUsuario: result.insertId, email, role: 'USUARIO', nome };
    res.status(201).json({ user, token: tokenFor(user) });
  } catch (error) { res.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ error: 'Não foi possível criar a conta.' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT idUsuario,nome,email,senha,role FROM usuarios WHERE email=? LIMIT 1', [req.body.email]);
    const row = rows[0];
    if (!row || !verifyPassword(req.body.senha, row.senha)) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    const user = { idUsuario: row.idUsuario, email: row.email, role: row.role, nome: row.nome };
    res.json({ user, token: tokenFor(user) });
  } catch (_) { res.status(500).json({ error: 'Falha ao entrar.' }); }
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
    const isOwner = req.user && Number(rows[0].usuario_id) === Number(req.user.idUsuario);
    if (!isPublic && !isOwner && req.user?.role !== 'ADMIN') return res.status(404).json({ error: 'Caso não encontrado.' });
    res.json(publicCase(rows[0]));
  } catch (_) { res.status(500).json({ error: 'Falha ao consultar caso.' }); }
});

app.get('/api/me/cases', auth(), async (req, res) => {
  try {
    const [rows] = await pool.execute(`${caseQuery} WHERE d.usuario_id=? ORDER BY d.idDesaparecidos DESC`, [req.user.idUsuario]);
    res.json(rows.map(publicCase));
  } catch (_) { res.status(500).json({ error: 'Falha ao consultar seus casos.' }); }
});

app.get('/api/me/notifications', auth(), async (req, res) => {
  try {
    const [rows] = await pool.execute(`SELECT n.idNotificacoes AS id, n.mensagem, a.descricao, a.cidade_id
      FROM notificacoes n JOIN alertas a ON a.idAlertas=n.alerta_id
      WHERE n.usuario_id=? ORDER BY n.idNotificacoes DESC`, [req.user.idUsuario]);
    res.json(rows);
  } catch (_) { res.status(500).json({ error: 'Falha ao consultar notificações.' }); }
});

app.get('/api/cases/:id/history', auth(false), async (req, res) => {
  try {
    const [allowed] = await pool.execute('SELECT usuario_id,status,is_public FROM desaparecidos WHERE idDesaparecidos=? AND (is_public=1 OR usuario_id=? OR ?="ADMIN")', [req.params.id, req.user?.idUsuario || null, req.user?.role || '']);
    if (!allowed[0]) return res.status(404).json({ error: 'Caso não encontrado.' });
    const [rows] = await pool.execute(`SELECT h.idHistorico AS id, h.acao, h.descricao, h.data_acao AS created_at, u.nome AS usuario
      FROM historico_desaparecido h LEFT JOIN usuarios u ON u.idUsuario=h.usuario_id WHERE h.desaparecido_id=? ORDER BY h.data_acao`, [req.params.id]);
    res.json(rows);
  } catch (_) { res.status(500).json({ error: 'Falha ao consultar histórico.' }); }
});

app.post('/api/cases', auth(), async (req, res) => {
  const data = req.body;
  if (!data.full_name || !data.disappearance_date || !data.city || !data.state || !data.circumstances) return res.status(400).json({ error: 'Preencha nome, data, cidade, estado e circunstâncias.' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [cities] = await connection.execute('SELECT c.idCidades FROM cidades c JOIN estados e ON e.idEstados=c.estado_id WHERE c.nome=? AND e.nome=? LIMIT 1', [data.city, data.state]);
    if (!cities[0]) { await connection.rollback(); return res.status(400).json({ error: 'Cidade e estado não encontrados.' }); }
    const [bo] = await connection.execute('INSERT INTO boletim_ocorrencia (numero_bo,data_registro,descricao) VALUES (?,?,?)', [data.police_report || null, new Date(), data.circumstances]);
    const gender = data.gender === 'Masculino' ? 'MASCULINO' : data.gender === 'Feminino' ? 'FEMININO' : 'OUTRO';
    const [result] = await connection.execute(`INSERT INTO desaparecidos
      (boletim_ocorrencia_id,usuario_id,nome,nome_social,data_nascimento,sexo,altura,peso,cor_olhos,cor_cabelo,cor_pele,ultima_roupa,caracteristicas,descricao,foto_url,data_desaparecimento,cidade_id,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'PENDENTE')`, [bo.insertId, req.user.idUsuario, data.full_name, data.nickname || null, data.birth_date || null, gender, data.height_cm || null, data.weight_kg || null, data.eye_color || null, data.hair_color || null, data.skin_color || null, data.clothing || null, data.marks || null, data.circumstances, data.foto_url || null, data.disappearance_date, cities[0].idCidades]);
    await insertHistory(connection, result.insertId, req.user.idUsuario, 'CADASTRO', 'Cadastro recebido e aguardando triagem.');
    await connection.commit();
    const [rows] = await pool.execute(`${caseQuery} WHERE d.idDesaparecidos=?`, [result.insertId]);
    res.status(201).json(publicCase(rows[0]));
  } catch (_) { await connection.rollback(); res.status(500).json({ error: 'Falha ao registrar caso.' }); }
  finally { connection.release(); }
});

app.post('/api/sightings', auth(), async (req, res) => {
  try {
    const data = req.body;
    const [cities] = await pool.execute('SELECT c.idCidades FROM cidades c JOIN estados e ON e.idEstados=c.estado_id WHERE c.nome=? AND e.nome=? LIMIT 1', [data.city, data.state]);
    if (!cities[0]) return res.status(400).json({ error: 'Cidade e estado do avistamento não encontrados.' });
    const [result] = await pool.execute('INSERT INTO avistamentos (desaparecidos_id,usuario_id,cidade_id,endereco,data_avistamento,descricao) VALUES (?,?,?,?,?,?)', [data.case_id, req.user.idUsuario, cities[0].idCidades, data.location || null, data.sighting_date || new Date(), data.description]);
    res.status(201).json({ id: result.insertId });
  } catch (_) { res.status(500).json({ error: 'Falha ao registrar avistamento.' }); }
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
  try { const filter = caseFilters(req.query); const [rows] = await pool.execute(`${caseQuery}${filter.where} ORDER BY d.idDesaparecidos DESC`, filter.values); res.json(rows.map(publicCase)); }
  catch (_) { res.status(500).json({ error: 'Falha ao consultar casos administrativos.' }); }
});

async function updateCaseStatus(req, res, status, action, description) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const expected = action === 'APROVACAO' || action === 'REJEICAO' ? 'PENDENTE' : 'ATIVO';
    const [result] = await connection.execute('UPDATE desaparecidos SET status=?, is_public=? WHERE idDesaparecidos=? AND status=?', [status, status === 'ATIVO' ? 1 : 0, req.params.id, expected]);
    if (!result.affectedRows) { await connection.rollback(); return res.status(404).json({ error: 'Caso não encontrado ou fora do fluxo permitido.' }); }
    await insertHistory(connection, req.params.id, req.user.idUsuario, action, description);
    await notifyCaseOwner(connection, req.params.id, description);
    await connection.commit();
    res.json({ ok: true, status });
  } catch (_) { await connection.rollback(); res.status(500).json({ error: 'Falha ao atualizar caso.' }); }
  finally { connection.release(); }
}

app.put('/api/admin/cases/:id/approve', auth(), adminOnly, (req, res) => updateCaseStatus(req, res, 'ATIVO', 'APROVACAO', 'Caso aprovado e publicado.'));
app.put('/api/admin/cases/:id/reject', auth(), adminOnly, (req, res) => updateCaseStatus(req, res, 'REJEITADO', 'REJEICAO', req.body.reason || 'Caso rejeitado pela administração.'));
app.put('/api/admin/cases/:id/archive', auth(), adminOnly, (req, res) => updateCaseStatus(req, res, 'ARQUIVADO', 'ARQUIVAMENTO', 'Caso arquivado pela administração.'));

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
    await connection.execute('UPDATE solicitacoes_reencontro SET status=?, administrador_id=?, data_analise=NOW() WHERE idSolicitacao=?', [requestStatus, req.user.idUsuario, req.params.id]);
    if (approved) {
      await connection.execute("UPDATE desaparecidos SET status='ENCONTRADO', is_public=1, found_at=NOW() WHERE idDesaparecidos=? AND status='ATIVO'", [request.desaparecido_id]);
      await insertHistory(connection, request.desaparecido_id, req.user.idUsuario, 'REENCONTRO_APROVADO', 'Solicitação aprovada; caso marcado como encontrado.');
      await notifyCaseOwner(connection, request.desaparecido_id, 'A solicitação de reencontro foi aprovada.');
    } else {
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
