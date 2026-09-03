/* ============================================================
   VARG — camada de dados (protótipo)
   Simula um banco de dados usando localStorage, com as MESMAS
   tabelas e campos que o banco real (PostgreSQL/Supabase) terá:
   cases, sightings, news, partners, contact_messages, profiles.
   Quando o backend existir, troque as funções DB.* por chamadas
   fetch()/API — o restante do site não muda.
   ============================================================ */

const DB = (() => {
  const KEY = "varg_db_v1";

  function seed() {
    return {
      cases: [
        {
          id: "c1", protocol: "VARG-2026-000101", full_name: "Marina Ferreira Alves",
          nickname: "Mari", age: 24, gender: "Feminino", city: "Belo Horizonte", state: "MG",
          disappearance_date: "2026-06-12", last_seen_location: "Terminal Rodoviário, Belo Horizonte",
          circumstances: "Saiu de casa para trabalhar e não retornou. Câmeras a registraram no terminal rodoviário por volta das 18h.",
          height_cm: 165, weight_kg: 58, eye_color: "Castanhos", hair_color: "Castanho escuro", skin_color: "Parda",
          clothing: "Blusa branca, calça jeans azul, mochila preta",
          marks: "Pequena cicatriz acima da sobrancelha direita", tattoos: "Estrela pequena no pulso esquerdo",
          family_contact_name: "Renata Alves", family_contact_phone: "(31) 99999-1010",
          status: "active", is_urgent: true, is_public: true, views: 812, photo_url: "",
          created_at: "2026-06-13T10:00:00"
        },
        {
          id: "c2", protocol: "VARG-2026-000098", full_name: "João Pedro Nascimento",
          nickname: "JP", age: 71, gender: "Masculino", city: "Campinas", state: "SP",
          disappearance_date: "2026-07-02", last_seen_location: "Praça Central, Campinas",
          circumstances: "Idoso com quadro de Alzheimer, saiu para caminhar e não retornou.",
          height_cm: 172, weight_kg: 70, eye_color: "Verdes", hair_color: "Grisalho", skin_color: "Branca",
          clothing: "Camisa xadrez, calça social cinza", marks: "Usa óculos de grau", tattoos: "",
          family_contact_name: "Carlos Nascimento", family_contact_phone: "(19) 98888-2020",
          status: "active", is_urgent: true, is_public: true, views: 430, photo_url: "",
          created_at: "2026-07-02T15:30:00"
        },
        {
          id: "c3", protocol: "VARG-2026-000075", full_name: "Beatriz Souza Lima",
          nickname: "Bia", age: 16, gender: "Feminino", city: "Salvador", state: "BA",
          disappearance_date: "2026-05-20", last_seen_location: "Escola Estadual Central, Salvador",
          circumstances: "Não retornou da escola. Última localização de celular registrada no bairro da Barra.",
          height_cm: 160, weight_kg: 52, eye_color: "Castanhos", hair_color: "Cacheado, preto", skin_color: "Negra",
          clothing: "Uniforme escolar azul", marks: "", tattoos: "",
          family_contact_name: "Sandra Lima", family_contact_phone: "(71) 97777-3030",
          status: "found", is_urgent: false, is_public: true, views: 1290, photo_url: "",
          found_at: "2026-06-01T09:00:00", created_at: "2026-05-20T20:00:00"
        },
        {
          id: "c4", protocol: "VARG-2026-000112", full_name: "Ricardo Menezes Costa",
          nickname: "", age: 39, gender: "Masculino", city: "Curitiba", state: "PR",
          disappearance_date: "2026-07-28", last_seen_location: "Rodovia BR-277, km 45",
          circumstances: "Desapareceu após sair de casa de carro em direção ao trabalho.",
          height_cm: 178, weight_kg: 82, eye_color: "Castanhos", hair_color: "Preto", skin_color: "Parda",
          clothing: "Camisa polo azul-marinho", marks: "Tatuagem no antebraço direito", tattoos: "Sim",
          family_contact_name: "Patrícia Costa", family_contact_phone: "(41) 96666-4040",
          status: "pending", is_urgent: false, is_public: true, views: 96, photo_url: "",
          created_at: "2026-07-28T22:10:00"
        }
      ],
      case_updates: [
        { id:"u1", case_id:"c1", title:"Caso registrado", body:"Boletim de ocorrência formalizado e caso publicado.", is_official:true, created_at:"2026-06-13T10:05:00"},
        { id:"u2", case_id:"c1", title:"Nova testemunha", body:"Equipe está apurando relato de avistamento próximo ao terminal.", is_official:true, created_at:"2026-06-20T09:00:00"},
        { id:"u3", case_id:"c3", title:"Encontrada em segurança", body:"Beatriz foi localizada e está bem, reunida com a família.", is_official:true, created_at:"2026-06-01T09:00:00"}
      ],
      sightings: [
        { id:"s1", case_id:"c1", contact_name:"Anônimo", description:"Vi uma moça parecida caminhando perto da rodoviária.", city:"Belo Horizonte", state:"MG", sighting_date:"2026-06-18", status:"pending", created_at:"2026-06-18T14:00:00" }
      ],
      news: [
        { id:"n1", slug:"campanha-agosto-desaparecidos", title:"VARG lança campanha nacional de conscientização", excerpt:"Ação em parceria com órgãos públicos reforça a importância da denúncia rápida.", content:"A VARG lançou nesta semana uma campanha nacional voltada à conscientização sobre desaparecimentos, reforçando que as primeiras 48 horas são decisivas para a localização de uma pessoa. A iniciativa reúne cartazes, materiais digitais e parcerias com secretarias de segurança pública em todo o país, orientando a população sobre como registrar um boletim de ocorrência e como agir diante de um avistamento.", category:"Campanha", published:true, published_at:"2026-08-01T08:00:00" },
        { id:"n2", slug:"caso-beatriz-lima-reencontro", title:"Adolescente é reencontrada após 12 dias", excerpt:"Beatriz Souza Lima, 16 anos, foi localizada em segurança em Salvador.", content:"Após 12 dias de buscas, a adolescente Beatriz Souza Lima foi reencontrada em segurança na região metropolitana de Salvador. A localização contou com denúncias recebidas através da plataforma VARG, que foram repassadas às autoridades competentes. A família agradeceu o apoio recebido durante o período de buscas.", category:"Reencontro", published:true, published_at:"2026-06-02T11:00:00" },
        { id:"n3", slug:"parceria-forcas-seguranca", title:"VARG amplia parceria com forças de segurança estaduais", excerpt:"Nova integração permite que boletins registrados na plataforma cheguem mais rápido às autoridades.", content:"A plataforma VARG anunciou uma nova etapa de integração com secretarias de segurança pública estaduais, permitindo que informações de casos cadastrados cheguem de forma mais ágil às equipes responsáveis pelas investigações, reduzindo o tempo de resposta em casos urgentes.", category:"Institucional", published:true, published_at:"2026-07-10T09:00:00" }
      ],
      partners: [
        { id:"p1", name:"Secretaria de Segurança Pública", category:"Órgão Público", state:"Nacional", description:"Integração de boletins de ocorrência e apoio institucional às investigações." },
        { id:"p2", name:"Instituto Vidas Reencontradas", category:"ONG", state:"SP", description:"Apoio psicológico e jurídico gratuito a famílias de pessoas desaparecidas." },
        { id:"p3", name:"Rede de Rádios Comunitárias", category:"Mídia", state:"Nacional", description:"Divulgação de alertas de desaparecimento em rádios de todo o país." },
        { id:"p4", name:"Conselho Tutelar Municipal", category:"Órgão Público", state:"MG", description:"Apoio em casos envolvendo crianças e adolescentes desaparecidos." }
      ],
      contact_messages: [],
      profiles: [
        { id:"admin-1", email:"admin@varg.org.br", full_name:"Administrador VARG", role:"admin" }
      ],
      session: null
    };
  }

  function load() {
    const raw = localStorage.getItem(KEY);
    if (!raw) { const s = seed(); localStorage.setItem(KEY, JSON.stringify(s)); return s; }
    try { return JSON.parse(raw); } catch(e) { const s = seed(); localStorage.setItem(KEY, JSON.stringify(s)); return s; }
  }
  function save(db) { localStorage.setItem(KEY, JSON.stringify(db)); }
  function uid(prefix){ return prefix + "_" + Math.random().toString(36).slice(2,9); }

  return {
    all() { return load(); },
    getCases(filters = {}) {
      let list = load().cases.filter(c => c.is_public !== false);
      if (filters.q) {
        const q = filters.q.toLowerCase();
        list = list.filter(c => c.full_name.toLowerCase().includes(q) || (c.nickname||"").toLowerCase().includes(q) || c.city.toLowerCase().includes(q));
      }
      if (filters.state) list = list.filter(c => c.state === filters.state);
      if (filters.status) list = list.filter(c => c.status === filters.status);
      if (filters.gender) list = list.filter(c => c.gender === filters.gender);
      return list.sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
    },
    getCaseById(id) { return load().cases.find(c => c.id === id) || null; },
    getUpdatesForCase(id) { return load().case_updates.filter(u => u.case_id === id).sort((a,b)=> new Date(a.created_at)-new Date(b.created_at)); },
    addCase(data) {
      const db = load();
      const seq = 100 + db.cases.length + 1;
      const protocol = "VARG-" + new Date().getFullYear() + "-" + String(seq).padStart(6,"0");
      const rec = Object.assign({
        id: uid("c"), protocol, status: "pending", is_urgent: false, is_public: false,
        views: 0, created_at: new Date().toISOString()
      }, data);
      db.cases.unshift(rec);
      db.case_updates.push({ id: uid("u"), case_id: rec.id, title: "Caso registrado", body: "Cadastro recebido e aguardando triagem da equipe VARG.", is_official: true, created_at: new Date().toISOString() });
      save(db);
      return rec;
    },
    addSighting(data) {
      const db = load();
      const rec = Object.assign({ id: uid("s"), status: "pending", created_at: new Date().toISOString() }, data);
      db.sightings.push(rec);
      save(db);
      return rec;
    },
    getNews() { return load().news.filter(n=>n.published).sort((a,b)=> new Date(b.published_at)-new Date(a.published_at)); },
    getNewsBySlug(slug) { return load().news.find(n => n.slug === slug) || null; },
    getPartners() { return load().partners; },
    addContactMessage(data) {
      const db = load();
      db.contact_messages.push(Object.assign({ id: uid("m"), handled:false, created_at: new Date().toISOString() }, data));
      save(db);
    },
    stats() {
      const db = load();
      const cases = db.cases;
      return {
        total: cases.length,
        ativos: cases.filter(c=>c.status==="active"||c.status==="pending").length,
        encontrados: cases.filter(c=>c.status==="found").length,
        urgentes: cases.filter(c=>c.is_urgent).length,
        porEstado: cases.reduce((acc,c)=>{ acc[c.state]=(acc[c.state]||0)+1; return acc; }, {}),
        porStatus: cases.reduce((acc,c)=>{ acc[c.status]=(acc[c.status]||0)+1; return acc; }, {})
      };
    },
    /* --- autenticação simplificada (protótipo, sem backend) --- */
    login(email) {
      const db = load();
      db.session = { email, logged_at: new Date().toISOString() };
      save(db);
      return db.session;
    },
    logout() { const db = load(); db.session = null; save(db); },
    getSession() { return load().session; }
  };
})();

/* ---------- utilidades de UI compartilhadas ---------- */
function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(()=> el.classList.remove("show"), 3200);
}
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}
function statusLabel(s) {
  return { pending:"Em triagem", active:"Busca ativa", found:"Encontrado(a)", archived:"Arquivado" }[s] || s;
}
function toggleMenu() {
  document.querySelector("nav.main-nav").classList.toggle("open");
}
function markActiveNav() {
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll("nav.main-nav a").forEach(a=>{
    if (a.getAttribute("href") === path) a.classList.add("active");
  });
}
document.addEventListener("DOMContentLoaded", markActiveNav);
