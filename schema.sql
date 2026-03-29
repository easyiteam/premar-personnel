-- ═══════════════════════════════════════════════════════════════
-- SCHÉMA POSTGRESQL — PRÉMAR GESTION DU PERSONNEL
-- Version 1.0 — Préfecture Maritime du Bénin
-- ═══════════════════════════════════════════════════════════════

-- Extension UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── TABLE PERSONNEL ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS personnel (
  id          SERIAL PRIMARY KEY,
  grade       VARCHAR(20),
  nom         VARCHAR(150) NOT NULL,
  mat         VARCHAR(50),
  tel         VARCHAR(30),
  fonction    VARCHAR(200),
  armee       VARCHAR(60) NOT NULL DEFAULT 'Marine Nationale',
  obs         TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'present'
                CHECK (status IN ('present','absent','permission','mission','stage','reverse')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TABLE JOURNAL (rapports quotidiens) ────────────────────────
CREATE TABLE IF NOT EXISTS journal (
  id            SERIAL PRIMARY KEY,
  date_rapport  DATE NOT NULL UNIQUE,
  redacteur     VARCHAR(150),
  heure         VARCHAR(10),
  activites     TEXT,
  mouvements    TEXT,
  incidents     TEXT,
  directives    TEXT,
  snapshot      JSONB,          -- effectifs au moment de la rédaction
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TABLE AGENDA (activités du Préfet) ─────────────────────────
CREATE TABLE IF NOT EXISTS agenda (
  id          VARCHAR(30) PRIMARY KEY DEFAULT ('ag_' || extract(epoch from now())::bigint::text),
  titre       VARCHAR(300) NOT NULL,
  date_acti   DATE NOT NULL,
  heure       VARCHAR(10),
  heure_fin   VARCHAR(10),
  lieu        VARCHAR(200),
  type_acti   VARCHAR(30) DEFAULT 'reunion'
                CHECK (type_acti IN ('reunion','ceremonie','visite','atelier','formation','mission','audience','autre')),
  description TEXT,
  rappel      INTEGER DEFAULT 15,  -- minutes
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TRIGGER updated_at ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_personnel_updated
  BEFORE UPDATE ON personnel
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_journal_updated
  BEFORE UPDATE ON journal
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_agenda_updated
  BEFORE UPDATE ON agenda
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── INDEX ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_personnel_status ON personnel(status);
CREATE INDEX IF NOT EXISTS idx_personnel_armee  ON personnel(armee);
CREATE INDEX IF NOT EXISTS idx_journal_date     ON journal(date_rapport DESC);
CREATE INDEX IF NOT EXISTS idx_agenda_date      ON agenda(date_acti);

-- ─── DONNÉES INITIALES (34 agents PRÉMAR) ───────────────────────
INSERT INTO personnel (grade, nom, mat, tel, fonction, armee, status) VALUES
  ('CTR-AM', 'AHOYO F. Maxime',          '',             '',             'PRÉFET MARITIME (PRÉMAR)',                           'Marine Nationale',    'present'),
  ('CVT',    'DO-SANTOS Alexis',          '',             '0197822748',   'MÉDECIN',                                           'Marine Nationale',    'present'),
  ('CCT',    'TOBOSSOU Rostan',           '',             '0195866048',   'CHEF DE CABINET',                                   'Marine Nationale',    'present'),
  ('LVM',    'ADANDE Dominique',          '',             '0197005838',   'RESP. SECRÉTARIAT ADMINISTRATIF',                   'Marine Nationale',    'present'),
  ('LVS',    'AGOSSOU Régis Hospice',     '',             '0165026212',   'RESP. SERVICE INFORMATIQUE & COMMUNICATION',         'Marine Nationale',    'present'),
  ('CP1',    'TOBOSSOU T. Paul W.',       '',             '0197551259',   'RESP. ENQUÊTES / SERVICE JURIDIQUE',                'Marine Nationale',    'present'),
  ('PMT',    'AHIYI Ariane',              '27580',        '0196205018',   'SECRÉTAIRE — SERVICE SÉCURITÉ MARITIME',            'Marine Nationale',    'present'),
  ('SGM',    'TCHAO Bachirou',            '26033',        '0197172542',   'CHEF PARC',                                         'Marine Nationale',    'present'),
  ('MTM',    'DEGBOE Kenneth',            '28958',        '0197133035',   'CHEF CELLULE TRANSMISSION / RESP. SALLE DE GYM',    'Marine Nationale',    'present'),
  ('SCH',    'YAROU Lafia Adama',         '29073',        '0167283030',   'OPÉRATRICE STANDARD & GESTION TÉLÉPHONIQUE',        'Marine Nationale',    'present'),
  ('MTR',    'ALINGO Marcel',             '32575',        '0166159143',   'CONDUCTEUR PRÉMAR',                                 'Marine Nationale',    'present'),
  ('SCH',    'GOGOVI Kouassi Gilles',     '25380',        '0197890748',   'CHEF SERVICE INTÉRIEUR',                            'Marine Nationale',    'present'),
  ('PCD',    'CODJIA Franck Horacio',     'DN00041480',   '0196139909',   'OPÉRATEUR',                                         'Personnel Civil',     'present'),
  ('MTR',    'TOUGAN Marius',             '32102',        '0197189129',   'AGENT COMPTABLE',                                   'Marine Nationale',    'present'),
  ('SGT',    'BOTON Gabin',              '27391',        '0196231835',   'OPÉRATEUR',                                         'Armée de Terre',      'present'),
  ('SMT',    'ASSIHIN Eulalie',           '34853',        '0168727716',   'OPÉRATRICE STANDARD',                               'Marine Nationale',    'present'),
  ('SMT',    'HOUNDADJO Edgard',          '36380',        '0196357515',   'SECRÉTAIRE SERVICE INTÉRIEUR',                      'Marine Nationale',    'present'),
  ('SBP',    'EDJEKPOTO Ange',            'PR005399',     '0196182600',   'OPÉRATEUR',                                         'Police Républicaine', 'present'),
  ('SBP',    'ALIKPONOU C. Prudence',     'PR003882',     '0197133788',   'OPÉRATEUR',                                         'Police Républicaine', 'present'),
  ('CCH',    'HOUNTONDJI Pierre-Canisius','27472',        '0197134681',   'RESP. SYSTÈME INFORMATIQUE & COMMUNICATION',        'Marine Nationale',    'present'),
  ('AC1',    'BOKO Roland',              'DN00067436',   '0197377706',   'OPÉRATEUR',                                         'Personnel Civil',     'present'),
  ('QM1',    'AKPACLA Doris',             '36264',        '0196075753',   'ASSISTANTE MÉDICALE',                               'Marine Nationale',    'present'),
  ('QM1',    'TCHOKPONHOUE Wilfred',      '39727',        '0167333711',   'AGENT DE LIAISON',                                  'Marine Nationale',    'present'),
  ('CCH',    'ABDOULAYE Djibrila',        '37011',        '0166776348',   'AGENT SERVICE COURANT',                             'Marine Nationale',    'present'),
  ('CCH',    'GARBA Fataou',             '32748',        '0196200349',   'AGENT SERVICE COURANT',                             'Marine Nationale',    'present'),
  ('QM1',    'HONVOH Carmel',            '39196',        '0197478556',   'OPÉRATEUR TRANSMETTEUR',                            'Marine Nationale',    'present'),
  ('QM1',    'BALOGOUN Mouchid',          '39383',        '0196660258',   'OPÉRATEUR TRANSMETTEUR',                            'Marine Nationale',    'present'),
  ('SD1',    'TOMAVO Prudence',           '28353',        '0195023366',   'SECRÉTAIRE',                                        'Marine Nationale',    'present'),
  ('MME',    'GUEDOU Marilyne',           '',             '0197932783',   'SECRÉTAIRE PARTICULIÈRE',                           'Personnel Civil',     'present'),
  ('MTM',    'IBRAHIMA Djamilatou',       '29280',        '0197810442',   'OPÉRATRICE',                                        'Marine Nationale',    'present'),
  ('QM1',    'HOMETOWOU Aristide',        '37410',        '0152937973',   'OPÉRATEUR',                                         'Marine Nationale',    'present'),
  ('MT1',    'ADEGBITE Crédo',           '39023',        '0162017828',   'COURSIER',                                          'Marine Nationale',    'present'),
  ('MT1',    'AGBANGBE Armelle',          '37536',        '0197358624',   'SECRÉTAIRE',                                        'Marine Nationale',    'present'),
  ('MT1',    'TONOUKOUIN Christel',       '42677',        '0165665853',   'SECRÉTAIRE & ASSISTANTE DU C/CAB',                  'Marine Nationale',    'present')
ON CONFLICT DO NOTHING;


-- ─── TABLE COURRIER ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courrier (
  id            SERIAL PRIMARY KEY,
  type          VARCHAR(10) NOT NULL CHECK (type IN ('arrivee','depart')),
  numero        VARCHAR(50),
  date_courrier DATE NOT NULL DEFAULT CURRENT_DATE,
  expediteur    VARCHAR(200),
  destinataire  VARCHAR(200),
  objet         TEXT NOT NULL,
  reference     VARCHAR(100),
  priorite      VARCHAR(10) DEFAULT 'normale'
                  CHECK (priorite IN ('normale','urgente','confidentielle')),
  statut        VARCHAR(20) DEFAULT 'recu'
                  CHECK (statut IN ('recu','en_cours','traite','archive','envoye','brouillon')),
  personnel_id  INTEGER REFERENCES personnel(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_courrier_updated
  BEFORE UPDATE ON courrier
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_courrier_type    ON courrier(type);
CREATE INDEX IF NOT EXISTS idx_courrier_date    ON courrier(date_courrier DESC);
CREATE INDEX IF NOT EXISTS idx_courrier_statut  ON courrier(statut);
CREATE INDEX IF NOT EXISTS idx_courrier_perso   ON courrier(personnel_id);