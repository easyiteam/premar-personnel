// ═══════════════════════════════════════════════════════════════
// PRÉMAR — Serveur Node.js / Express
// Préfecture Maritime du Bénin
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();

const express    = require('express');
const { Pool }   = require('pg');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const compression = require('compression');
const path       = require('path');
const fs         = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── CONNEXION POSTGRESQL ─────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Test connexion au démarrage
pool.connect()
.then(client => {
    console.log('✅ PostgreSQL connecté');
    client.release();
    client.query("SET timezone = 'Africa/Porto-Novo'");
    return initDatabase();
  })
  .catch(err => {
    console.error('❌ Erreur connexion PostgreSQL:', err.message);
    process.exit(1);
  });

// ─── INITIALISATION BASE DE DONNÉES ──────────────────────────────────────
async function initDatabase() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.warn('⚠️  schema.sql introuvable — tables non créées automatiquement');
    return;
  }
  const sql = fs.readFileSync(schemaPath, 'utf8');
  try {
    await pool.query(sql);
    console.log('✅ Schéma PostgreSQL initialisé');
  } catch (err) {
    console.error('⚠️  Erreur schéma (peut être déjà existant):', err.message);
  }
}

// ─── MIDDLEWARES ─────────────────────────────────────────────────────────
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: false,   // désactivé car l'app charge des fonts Google
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Fichiers statiques (le front-end)
app.use(express.static(path.join(__dirname, 'public')));

// ─── HELPER ─────────────────────────────────────────────────────────────
const ok  = (res, data)        => res.json({ success: true, data });
const err = (res, msg, code=500) => res.status(code).json({ success: false, error: msg });

// ═══════════════════════════════════════════════════════════════
// API PERSONNEL
// ═══════════════════════════════════════════════════════════════

// GET /api/personnel — liste tous les agents
app.get('/api/personnel', async (req, res) => {
  try {
    const { armee, status, q } = req.query;
    let sql = 'SELECT * FROM personnel WHERE 1=1';
    const params = [];

    if (armee) {
      params.push(armee);
      sql += ` AND armee = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      sql += ` AND (LOWER(nom) LIKE $${params.length} OR LOWER(grade) LIKE $${params.length} OR LOWER(fonction) LIKE $${params.length} OR LOWER(mat) LIKE $${params.length})`;
    }

    sql += ' ORDER BY id ASC';
    const result = await pool.query(sql, params);
    ok(res, result.rows);
  } catch (e) {
    err(res, e.message);
  }
});

// GET /api/personnel/stats — statistiques globales
app.get('/api/personnel/stats', async (req, res) => {
  try {
    const situations = await pool.query(`
      SELECT status, COUNT(*)::int AS count FROM personnel GROUP BY status
    `);
    const armees = await pool.query(`
      SELECT armee, COUNT(*)::int AS count FROM personnel GROUP BY armee ORDER BY count DESC
    `);
    const total = await pool.query('SELECT COUNT(*)::int AS count FROM personnel');
    ok(res, {
      total: total.rows[0].count,
      situations: Object.fromEntries(situations.rows.map(r => [r.status, r.count])),
      armees: Object.fromEntries(armees.rows.map(r => [r.armee, r.count])),
    });
  } catch (e) {
    err(res, e.message);
  }
});

// POST /api/personnel — créer un agent
app.post('/api/personnel', async (req, res) => {
  try {
    const { grade, nom, mat, tel, fonction, armee, obs, status } = req.body;
    if (!nom) return err(res, 'Le nom est obligatoire', 400);
    const result = await pool.query(
      `INSERT INTO personnel (grade, nom, mat, tel, fonction, armee, obs, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [grade||'', nom, mat||'', tel||'', fonction||'', armee||'Marine Nationale', obs||'', status||'present']
    );
    ok(res, result.rows[0]);
  } catch (e) {
    err(res, e.message);
  }
});

// PUT /api/personnel/:id — modifier un agent
app.put('/api/personnel/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { grade, nom, mat, tel, fonction, armee, obs, status } = req.body;
    const result = await pool.query(
      `UPDATE personnel SET grade=$1, nom=$2, mat=$3, tel=$4, fonction=$5,
       armee=$6, obs=$7, status=$8 WHERE id=$9 RETURNING *`,
      [grade, nom, mat, tel, fonction, armee, obs, status, id]
    );
    if (!result.rows.length) return err(res, 'Agent non trouvé', 404);
    ok(res, result.rows[0]);
  } catch (e) {
    err(res, e.message);
  }
});

// PATCH /api/personnel/:id/status — changer uniquement le statut (quick status)
app.patch('/api/personnel/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const valid = ['present','absent','permission','mission','stage','reverse'];
    if (!valid.includes(status)) return err(res, 'Statut invalide', 400);
    const result = await pool.query(
      'UPDATE personnel SET status=$1 WHERE id=$2 RETURNING *',
      [status, id]
    );
    if (!result.rows.length) return err(res, 'Agent non trouvé', 404);
    ok(res, result.rows[0]);
  } catch (e) {
    err(res, e.message);
  }
});

// DELETE /api/personnel/:id — supprimer un agent
app.delete('/api/personnel/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM personnel WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return err(res, 'Agent non trouvé', 404);
    ok(res, { deleted: req.params.id });
  } catch (e) {
    err(res, e.message);
  }
});

// ═══════════════════════════════════════════════════════════════
// API JOURNAL
// ═══════════════════════════════════════════════════════════════

// GET /api/journal — liste les rapports (optionnel: ?month=2026-03)
app.get('/api/journal', async (req, res) => {
  try {
    const { month, year } = req.query;
    let sql = 'SELECT * FROM journal WHERE 1=1';
    const params = [];
    if (month) {
      params.push(month + '-01');
      params.push(month + '-31');
      sql += ` AND date_rapport BETWEEN $${params.length-1} AND $${params.length}`;
    }
    if (year) {
      params.push(`${year}-01-01`);
      params.push(`${year}-12-31`);
      sql += ` AND date_rapport BETWEEN $${params.length-1} AND $${params.length}`;
    }
    sql += ' ORDER BY date_rapport DESC';
    const result = await pool.query(sql, params);
    ok(res, result.rows);
  } catch (e) {
    err(res, e.message);
  }
});

// POST /api/journal — créer ou remplacer le rapport du jour (UPSERT)
app.post('/api/journal', async (req, res) => {
  try {
    const { date_rapport, redacteur, heure, activites, mouvements, incidents, directives, snapshot } = req.body;
    if (!date_rapport) return err(res, 'La date est obligatoire', 400);
    if (!redacteur)    return err(res, 'Le rédacteur est obligatoire', 400);

    const result = await pool.query(
      `INSERT INTO journal (date_rapport, redacteur, heure, activites, mouvements, incidents, directives, snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (date_rapport) DO UPDATE SET
         redacteur=$2, heure=$3, activites=$4, mouvements=$5,
         incidents=$6, directives=$7, snapshot=$8, updated_at=NOW()
       RETURNING *`,
      [date_rapport, redacteur, heure||'', activites||'', mouvements||'', incidents||'', directives||'', JSON.stringify(snapshot||{})]
    );
    ok(res, result.rows[0]);
  } catch (e) {
    err(res, e.message);
  }
});

// DELETE /api/journal/:id
app.delete('/api/journal/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM journal WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return err(res, 'Rapport non trouvé', 404);
    ok(res, { deleted: req.params.id });
  } catch (e) {
    err(res, e.message);
  }
});

// ═══════════════════════════════════════════════════════════════
// API AGENDA
// ═══════════════════════════════════════════════════════════════

// GET /api/agenda — liste les activités (optionnel: ?from=2026-03-01&to=2026-03-31)
app.get('/api/agenda', async (req, res) => {
  try {
    const { from, to, type } = req.query;
    let sql = 'SELECT * FROM agenda WHERE 1=1';
    const params = [];
    if (from) { params.push(from); sql += ` AND date_acti >= $${params.length}`; }
    if (to)   { params.push(to);   sql += ` AND date_acti <= $${params.length}`; }
    if (type) { params.push(type); sql += ` AND type_acti = $${params.length}`; }
    sql += ' ORDER BY date_acti ASC, heure ASC NULLS LAST';
    const result = await pool.query(sql, params);
    ok(res, result.rows);
  } catch (e) {
    err(res, e.message);
  }
});

// POST /api/agenda — créer une activité
app.post('/api/agenda', async (req, res) => {
  try {
    const { titre, date_acti, heure, heure_fin, lieu, type_acti, description, rappel } = req.body;
    if (!titre)     return err(res, 'Le titre est obligatoire', 400);
    if (!date_acti) return err(res, 'La date est obligatoire', 400);
    const id = 'ag_' + Date.now();
    const result = await pool.query(
      `INSERT INTO agenda (id, titre, date_acti, heure, heure_fin, lieu, type_acti, description, rappel)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [id, titre, date_acti, heure||null, heure_fin||null, lieu||'', type_acti||'reunion', description||'', parseInt(rappel)||15]
    );
    ok(res, result.rows[0]);
  } catch (e) {
    err(res, e.message);
  }
});

// PUT /api/agenda/:id — modifier une activité
app.put('/api/agenda/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { titre, date_acti, heure, heure_fin, lieu, type_acti, description, rappel } = req.body;
    const result = await pool.query(
      `UPDATE agenda SET titre=$1, date_acti=$2, heure=$3, heure_fin=$4,
       lieu=$5, type_acti=$6, description=$7, rappel=$8 WHERE id=$9 RETURNING *`,
      [titre, date_acti, heure||null, heure_fin||null, lieu||'', type_acti||'reunion', description||'', parseInt(rappel)||15, id]
    );
    if (!result.rows.length) return err(res, 'Activité non trouvée', 404);
    ok(res, result.rows[0]);
  } catch (e) {
    err(res, e.message);
  }
});

// DELETE /api/agenda/:id
app.delete('/api/agenda/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM agenda WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return err(res, 'Activité non trouvée', 404);
    ok(res, { deleted: req.params.id });
  } catch (e) {
    err(res, e.message);
  }
});

// ─── HEALTH CHECK ────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    const db = await pool.query('SELECT NOW() AS now');
    res.json({ status: 'OK', db: db.rows[0].now, version: '1.0.0' });
  } catch (e) {
    res.status(500).json({ status: 'ERROR', error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// API COURRIER
// ═══════════════════════════════════════════════════════════════

// GET /api/courrier
app.get('/api/courrier', async (req, res) => {
  try {
    const { type, statut, priorite, personnel_id, q } = req.query;
    let sql = `
      SELECT c.*, p.nom as personnel_nom, p.grade as personnel_grade
      FROM courrier c
      LEFT JOIN personnel p ON c.personnel_id = p.id
      WHERE 1=1`;
    const params = [];
    if (type)         { params.push(type);         sql += ` AND c.type = $${params.length}`; }
    if (statut)       { params.push(statut);       sql += ` AND c.statut = $${params.length}`; }
    if (priorite)     { params.push(priorite);     sql += ` AND c.priorite = $${params.length}`; }
    if (personnel_id) { params.push(personnel_id); sql += ` AND c.personnel_id = $${params.length}`; }
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      sql += ` AND (LOWER(c.objet) LIKE $${params.length} OR LOWER(c.expediteur) LIKE $${params.length} OR LOWER(c.reference) LIKE $${params.length})`;
    }
    sql += ' ORDER BY c.date_courrier DESC, c.created_at DESC';
    const result = await pool.query(sql, params);
    ok(res, result.rows);
  } catch (e) { err(res, e.message); }
});

// GET /api/courrier/stats
app.get('/api/courrier/stats', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE type='arrivee')::int                    AS total_arrivee,
        COUNT(*) FILTER (WHERE type='depart')::int                     AS total_depart,
        COUNT(*) FILTER (WHERE statut='en_cours')::int                 AS en_cours,
        COUNT(*) FILTER (WHERE statut='recu' AND type='arrivee')::int  AS non_traites,
        COUNT(*) FILTER (WHERE priorite='urgente')::int                AS urgents,
        COUNT(*) FILTER (WHERE date_courrier = CURRENT_DATE)::int      AS du_jour
      FROM courrier`);
    ok(res, r.rows[0]);
  } catch (e) { err(res, e.message); }
});

// POST /api/courrier
app.post('/api/courrier', async (req, res) => {
  try {
    const { type, numero, date_courrier, expediteur, destinataire,
            objet, reference, priorite, statut, personnel_id, notes } = req.body;
    if (!objet) return err(res, 'L\'objet est obligatoire', 400);
    if (!type)  return err(res, 'Le type est obligatoire', 400);
    const result = await pool.query(
      `INSERT INTO courrier (type,numero,date_courrier,expediteur,destinataire,objet,reference,priorite,statut,personnel_id,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [type, numero||'', date_courrier||new Date().toISOString().slice(0,10),
       expediteur||'', destinataire||'', objet,
       reference||'', priorite||'normale',
       statut||(type==='arrivee'?'recu':'brouillon'),
       personnel_id||null, notes||'']
    );
    ok(res, result.rows[0]);
  } catch (e) { err(res, e.message); }
});

// PUT /api/courrier/:id
app.put('/api/courrier/:id', async (req, res) => {
  try {
    const { type, numero, date_courrier, expediteur, destinataire,
            objet, reference, priorite, statut, personnel_id, notes } = req.body;
    const result = await pool.query(
      `UPDATE courrier SET type=$1,numero=$2,date_courrier=$3,expediteur=$4,
       destinataire=$5,objet=$6,reference=$7,priorite=$8,statut=$9,
       personnel_id=$10,notes=$11 WHERE id=$12 RETURNING *`,
      [type, numero, date_courrier, expediteur, destinataire, objet,
       reference, priorite, statut, personnel_id||null, notes, req.params.id]
    );
    if (!result.rows.length) return err(res, 'Courrier non trouvé', 404);
    ok(res, result.rows[0]);
  } catch (e) { err(res, e.message); }
});

// PATCH /api/courrier/:id/statut
app.patch('/api/courrier/:id/statut', async (req, res) => {
  try {
    const { statut } = req.body;
    const result = await pool.query(
      'UPDATE courrier SET statut=$1 WHERE id=$2 RETURNING *',
      [statut, req.params.id]
    );
    if (!result.rows.length) return err(res, 'Courrier non trouvé', 404);
    ok(res, result.rows[0]);
  } catch (e) { err(res, e.message); }
});

// DELETE /api/courrier/:id
app.delete('/api/courrier/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM courrier WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return err(res, 'Courrier non trouvé', 404);
    ok(res, { deleted: req.params.id });
  } catch (e) { err(res, e.message); }
});

// ─── TOUTES LES AUTRES ROUTES → index.html ───────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── DÉMARRAGE ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 PRÉMAR Server démarré sur le port ${PORT}`);
  console.log(`   Mode : ${process.env.NODE_ENV || 'development'}`);
});

// ─── GESTION DES ERREURS NON CATCHÉES ────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});