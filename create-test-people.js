const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const DB = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'VARGS'
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

async function ensureCity(connection, cityName, stateName) {
  const city = String(cityName || '').trim();
  const state = String(stateName || '').trim();
  if (!city || !state) return null;

  const [cityRows] = await connection.execute(
    'SELECT c.idCidades FROM cidades c JOIN estados e ON e.idEstados = c.estado_id WHERE c.nome = ? AND e.nome = ? LIMIT 1',
    [city, state]
  );
  if (cityRows[0]) return cityRows[0].idCidades;

  const [stateRows] = await connection.execute('SELECT idEstados FROM estados WHERE nome = ? LIMIT 1', [state]);
  if (!stateRows[0]) return null;

  const [inserted] = await connection.execute('INSERT INTO cidades (estado_id, nome) VALUES (?, ?)', [stateRows[0].idEstados, city]);
  return inserted.insertId;
}

function makeSvg(name, background, accent) {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 800">
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="${background}"/>
        <stop offset="100%" stop-color="#ffffff"/>
      </linearGradient>
    </defs>
    <rect width="640" height="800" fill="url(#bg)"/>
    <circle cx="320" cy="220" r="120" fill="#f4d7c8"/>
    <path d="M200 700c18-120 82-170 120-170s102 50 120 170" fill="${accent}"/>
    <path d="M220 170c20-80 70-120 100-120s80 40 100 120" fill="#1f2937" opacity="0.9"/>
    <circle cx="276" cy="215" r="10" fill="#1f2937"/>
    <circle cx="364" cy="215" r="10" fill="#1f2937"/>
    <path d="M285 270c25 25 45 25 70 0" stroke="#8b5e3c" stroke-width="7" fill="none" stroke-linecap="round"/>
    <rect x="150" y="650" width="340" height="70" rx="18" fill="rgba(17,24,39,0.08)"/>
    <text x="320" y="690" text-anchor="middle" font-size="34" font-family="Arial, sans-serif" font-weight="700" fill="#0f172a">${name}</text>
  </svg>
  `.trim();
}

async function main() {
  const connection = await mysql.createConnection(DB);
  const uploadDir = path.join(__dirname, 'js', 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  const people = [
    { name: 'Ana Beatriz Costa', city: 'São Paulo', state: 'São Paulo', birth: '2008-04-15', gender: 'Feminino', description: 'Desaparecida após sair de casa rumo à escola.', phone: '11999881234', photo: 'ana' },
    { name: 'Mateus Silva', city: 'Rio de Janeiro', state: 'Rio de Janeiro', birth: '2010-06-22', gender: 'Masculino', description: 'Último registro em praça próxima à residência.', phone: '21999001122', photo: 'mateus' },
    { name: 'Larissa Santos', city: 'Salvador', state: 'Bahia', birth: '2006-11-04', gender: 'Feminino', description: 'Foi vista pela última vez perto do terminal de ônibus.', phone: '71991234567', photo: 'larissa' },
    { name: 'João Pedro Almeida', city: 'Curitiba', state: 'Paraná', birth: '2012-01-18', gender: 'Masculino', description: 'Desapareceu durante caminhada com amigos.', phone: '41990001234', photo: 'joao' },
    { name: 'Sofia Menezes', city: 'Fortaleza', state: 'Ceará', birth: '2009-03-10', gender: 'Feminino', description: 'Possível deslocamento para cidade vizinha.', phone: '85981567890', photo: 'sofia' }
  ];

  const basePassword = 'Teste123!';
  console.log('Criando usuários e casos de teste...');

  for (const person of people) {
    const email = `${person.name.toLowerCase().replace(/[^a-z]/g, '')}@vargtest.local`;
    const [existing] = await connection.execute('SELECT idUsuario FROM usuarios WHERE LOWER(email)=? LIMIT 1', [email]);
    if (existing[0]) {
      console.log(`Usuário ${email} já existe, pulando.`);
      continue;
    }

    const userHash = hashPassword(basePassword);
    const [userResult] = await connection.execute(
      'INSERT INTO usuarios (nome, email, senha, telefone, role, ativo, email_2fa_enabled, auth_version) VALUES (?, ?, ?, ?, ?, 1, 0, 1)',
      [person.name, email, userHash, person.phone, 'USUARIO']
    );

    const cityId = await ensureCity(connection, person.city, person.state);
    if (!cityId) {
      throw new Error(`Cidade/estado não encontrado: ${person.city} / ${person.state}`);
    }

    const photoFile = path.join(uploadDir, `${person.photo}.svg`);
    fs.writeFileSync(photoFile, makeSvg(person.name.split(' ')[0], '#dbeafe', '#1d4ed8'));
    const photoUrl = `/uploads/${path.basename(photoFile)}`;

    const [boletim] = await connection.execute(
      'INSERT INTO boletim_ocorrencia (numero_bo, data_registro, delegacia, descricao) VALUES (?, NOW(), ?, ?)',
      [`BO-${String(Date.now()).slice(-8)}`, `Delegacia de ${person.city}`, person.description]
    );

    const disappearanceDate = new Date();
    disappearanceDate.setDate(disappearanceDate.getDate() - 5);

    await connection.execute(
      `INSERT INTO desaparecidos
        (boletim_ocorrencia_id, usuario_id, nome, data_nascimento, sexo, altura, peso, cor_olhos, cor_cabelo, cor_pele, ultima_roupa, caracteristicas, descricao, foto_url, data_desaparecimento, cidade_id, status, is_public, is_urgent, nome_responsavel, telefone_responsavel, email_responsavel)
       VALUES (?, ?, ?, ?, ?, 1.60, 58.0, 'CASTANHOS', 'PRETO', 'CLARA', 'Camiseta azul e calça jeans', 'Olheiras, sorriso característico', ?, ?, ?, ?, 'ATIVO', 1, 1, ?, ?, ? )`,
      [
        boletim.insertId,
        userResult.insertId,
        person.name,
        person.birth,
        person.gender === 'Masculino' ? 'MASCULINO' : 'FEMININO',
        person.description,
        photoUrl,
        disappearanceDate,
        cityId,
        person.name.split(' ')[0],
        person.phone,
        email
      ]
    );

    console.log(`✔ Criado: ${person.name} | email: ${email} | senha: ${basePassword} | foto: ${photoUrl}`);
  }

  console.log('\nTodos os testes foram criados com sucesso.');
  await connection.end();
}

main().catch((error) => {
  console.error('Erro ao criar dados de teste:', error);
  process.exit(1);
});
