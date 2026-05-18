# Ajouter un projet au portfolio

Toutes les données du portfolio (projets, outils, certifs, sources, CTAs) vivent dans **un seul fichier** : `data/pipeline.json`. Pour ajouter un projet, tu modifies ce fichier — pas besoin de toucher au code.

---

## Structure du fichier

`data/pipeline.json` contient deux sections principales :

```json
{
  "nodes": [ ... ],   // tous les nœuds du DAG (sources, outils, projets, certifs, ships)
  "edges": [ ... ]    // toutes les connexions entre nœuds
}
```

Un projet = **un objet** dans `nodes` + **plusieurs arêtes** dans `edges`.

---

## 1 — Ajouter le nœud projet

Ouvre `data/pipeline.json`, cherche la section `"nodes"`, et ajoute un nouvel objet à la suite des autres projets (cherche les blocs qui ont `"type": "project"` pour t'inspirer).

### Schéma complet d'un projet

```json
{
  "id": "p_mon_nouveau_projet",
  "type": "project",
  "lane": "MARTS",
  "row": 5,
  "label": "MON_PROJET",
  "kanji": "新",
  "year": "2026",

  "title_fr": "Titre du projet en français",
  "title_en": "Project title in English",

  "summary_fr": "Une à deux phrases qui résument le projet — visible dans la carte et au-dessus du drawer.",
  "summary_en": "One to two sentences summarizing the project — shown on the card and above the drawer.",

  "body_fr": "Le récit long du projet. Tu peux utiliser **du gras** (avec deux astérisques) et des sauts de paragraphe (double saut de ligne).\n\nNouveau paragraphe ici.",
  "body_en": "Long version. **Bold** and paragraph breaks supported.\n\nNew paragraph.",

  "stack": ["Python", "dbt", "Snowflake", "Docker"],

  "metrics": [
    { "label": "tables",     "value": "12" },
    { "label": "rows/jour",  "value": "2M" },
    { "label": "latence",    "value": "<5min" }
  ],

  "github_url": "https://github.com/JBaptisteAll/mon-repo",
  "live_url": "https://mon-app.streamlit.app/",

  "mermaid": "flowchart LR\n  A[Source] --> B[Transform]\n  B --> C[Marts]\n  C --> D[Dashboard]"
}
```

### Règles à respecter

| Champ | Obligatoire | Règle |
|---|---|---|
| `id` | ✅ | Identifiant unique. Préfixe `p_` par convention. Pas d'espaces, pas d'accents. |
| `type` | ✅ | Toujours `"project"` pour un projet. |
| `lane` | ✅ | Toujours `"MARTS"` pour un projet (3ᵉ lane). |
| `row` | ✅ | Position verticale dans la lane (0, 1, 2, 3...). Pour un nouveau projet, prends le plus grand `row` existant + 1. |
| `label` | ✅ | Nom court en MAJUSCULES_AVEC_UNDERSCORES. C'est le code-name visible sur la carte. |
| `kanji` | ✅ | **Un seul** caractère japonais (idéogramme). Voir suggestions plus bas. |
| `year` | ✅ | "2024", "2025", "2026"... |
| `title_fr` / `title_en` | ✅ | Titre humain bilingue. |
| `summary_fr` / `summary_en` | ✅ | 1–2 phrases. C'est ce que les recruteurs lisent en premier. |
| `body_fr` / `body_en` | ✅ | Le récit complet (la "story" du projet : problème → solution → résultat). |
| `stack` | ✅ | Tableau de strings. 3–5 techno phares. |
| `metrics` | ✅ | Exactement **3** chiffres impactants `{label, value}`. |
| `github_url` | recommandé | Lien du repo principal. |
| `live_url` | optionnel | Si une app est déployée (Streamlit, Vercel...) — ajoute un gros bouton 🚀 dans le drawer. |
| `mermaid` | optionnel mais conseillé | Diagramme d'architecture syntaxe [Mermaid](https://mermaid.js.org/syntax/flowchart.html). `\n` pour les sauts de ligne dans le JSON. |

### Suggestions de kanjis

| Thème | Kanji | Sens |
|---|---|---|
| Données | 数 | nombre, chiffres |
| Pipeline / flux | 流 | flux, courant |
| Modélisation | 形 | forme, modèle |
| IA / intelligence | 智 | intelligence, sagesse |
| Vitesse | 速 | rapide |
| Vision / dashboard | 視 | vue, regard |
| Sécurité / qualité | 守 | protéger |
| Nouveau | 新 | nouveau |
| Découverte / exploration | 探 | chercher |
| Vente / commerce | 売 | vendre |
| Voyage / tourisme | 旅 | voyage |
| Météo | 雲 | nuage |
| Reconnaissance | 識 | reconnaître |
| Vélo / sport | 輪 | roue, cycle |
| Avion / aérien | 翼 | aile |

Un kanji bien choisi donne du caractère à la carte. Si tu hésites, demande-moi.

---

## 2 — Connecter le projet au pipeline (edges)

Dans la section `"edges"` du même fichier, ajoute les connexions du projet. Chaque arête est un tableau `["source", "destination"]`.

**En entrée (amont)** : quels outils / sources alimentent le projet ?
**En sortie (aval)** : quelles certifs / ships valide-t-il ?

### Exemple complet

```json
[ "t_python",            "p_mon_nouveau_projet" ],
[ "t_dbt",               "p_mon_nouveau_projet" ],
[ "t_sql",               "p_mon_nouveau_projet" ],
[ "p_mon_nouveau_projet", "c_cdsd"             ],
[ "p_mon_nouveau_projet", "s_github"           ]
```

→ Le projet est alimenté par Python, dbt et SQL. Il valide la certif CDSD et finit dans le bouton GitHub.

### Cibles disponibles

**Outils en amont** (`t_*`)
- `t_python`, `t_sql`, `t_dbt`, `t_databricks`, `t_docker`, `t_viz`, `t_git`, `t_dim_modeling`

**Sources en amont** (`src_*`) — rare pour un projet, mais possible
- `src_about`, `src_education`, `src_experience`

**Certifs en aval** (`c_*`)
- `c_databricks_de`, `c_google_da`, `c_aws`, `c_dataiku`, `c_cdsd`
- ⚠️ ne connecte une certif que si le projet la valide vraiment (techno utilisée).

**Ships en aval** (`s_*`)
- `s_cv`, `s_contact`, `s_github`, `s_linkedin`
- `s_github` est quasi systématique pour un projet open-source.

---

## 3 — Exemple complet et concret

Disons que tu veux ajouter un projet **"Customer Churn Analyzer"** : pipeline Snowflake + dbt + Looker, validant CDSD.

### Nœud à coller dans `"nodes"`

```json
{
  "id": "p_churn",
  "type": "project",
  "lane": "MARTS",
  "row": 6,
  "label": "CHURN_ANALYZER",
  "kanji": "離",
  "year": "2026",

  "title_fr": "Customer Churn Analyzer",
  "title_en": "Customer Churn Analyzer",

  "summary_fr": "Pipeline analytique end-to-end pour identifier les signaux faibles de désabonnement client et déclencher des campagnes de rétention ciblées.",
  "summary_en": "End-to-end analytics pipeline identifying weak churn signals and triggering targeted retention campaigns.",

  "body_fr": "Le problème : un SaaS B2C de 50k utilisateurs perdait 8% de ses abonnés par mois sans comprendre pourquoi.\n\nLa solution : un pipeline Snowflake + dbt qui modélise le parcours utilisateur (events Segment), calcule 12 features comportementales (fréquence de login, dernière action, support tickets, NPS), et expose un mart `churn_signals` consommé par Looker.\n\n**Résultat** : détection de 3 cohortes à risque, campagnes ciblées par l'équipe CRM, churn ramené à **4,2%** en 3 mois.",
  "body_en": "The problem: a B2C SaaS with 50k users was losing 8% subscribers per month without understanding why.\n\nThe solution: a Snowflake + dbt pipeline modeling the user journey (Segment events), computing 12 behavioral features (login frequency, last action, support tickets, NPS), and exposing a `churn_signals` mart consumed by Looker.\n\n**Result**: detection of 3 at-risk cohorts, targeted campaigns by the CRM team, churn down to **4.2%** in 3 months.",

  "stack": ["Snowflake", "dbt", "Segment", "Looker"],

  "metrics": [
    { "label": "features",     "value": "12" },
    { "label": "churn final",  "value": "4,2%" },
    { "label": "cohortes",     "value": "3" }
  ],

  "github_url": "https://github.com/JBaptisteAll/customer-churn-analyzer",

  "mermaid": "flowchart LR\n  S[Segment events] --> SF[Snowflake]\n  SF --> D[dbt models]\n  D --> M[churn_signals mart]\n  M --> L[Looker dashboard]\n  L --> CRM[CRM team]"
}
```

### Arêtes à coller dans `"edges"`

```json
[ "t_sql",     "p_churn"   ],
[ "t_dbt",     "p_churn"   ],
[ "t_python",  "p_churn"   ],
[ "p_churn",   "c_cdsd"    ],
[ "p_churn",   "s_github"  ]
```

### Tester

Recharge la page (`Portfolio.html` ou `index.html`). Le nœud apparaît dans la lane MARTS avec ses connexions, son drawer complet (titre, story, métriques, stack, diagramme, lien GitHub) et son intégration au chain pipeline.

---

## Conseils

- **Une story par projet, pas une description.** Le format gagnant : *problème → solution → résultat (chiffré)*.
- **Métriques chiffrées.** "Quelques tables" ≪ "12 tables". "Plus rapide" ≪ "<5min".
- **Stack honnête.** Ne mets pas une techno si tu l'as juste effleurée — la connexion à un nœud `tool` impliquera que le projet la valide.
- **Mermaid simple.** 4–6 boîtes max, sinon ça devient illisible dans le drawer.
- **Kanji cohérent.** Si tu hésites entre deux, garde celui qui résume le mieux le projet en un caractère.

---

## En cas de pépin

Si tu casses le JSON (virgule manquante, accolade mal fermée), la page restera bloquée sur le loader *"booting pipeline…"*. Ouvre la console (F12 → Console) → tu verras le message d'erreur de parse, avec la ligne exacte.

Outils utiles :
- [JSONLint](https://jsonlint.com/) pour valider le JSON
- [Mermaid Live Editor](https://mermaid.live/) pour prototyper un diagramme avant de le coller
