# Ajouter un projet au portfolio

Les projets du site sont générés automatiquement à partir de tes repos GitHub. Tu ne modifies plus `data/pipeline.json` à la main pour un projet : tout se passe dans le repo du projet.

## En bref

1. Dans le repo du projet, ajoute les **topics** de sa stack (`dbt`, `airflow`, `python`…).
2. Ajoute un fichier **`portfolio.json`** à la racine du repo (modèle plus bas). Sans ce fichier, un LLM rédige la fiche à partir du README et te la propose en pull request.
3. Ajoute le topic **`portfolio`** : le projet apparaît sur le site à la prochaine synchronisation.

Pour retirer un projet du site, enlève le topic `portfolio`. Sa fiche reste en cache : le remettre plus tard ne coûte rien.

## Comment ça marche

Le script [scripts/sync_projects.py](scripts/sync_projects.py) tourne chaque nuit via GitHub Actions (et à la demande, onglet Actions, « Sync portfolio projects », « Run workflow »).

| Élément de la fiche | Source |
|---|---|
| Projets publiés | Repos publics portant le topic `portfolio` |
| Textes, métriques, kanji | `portfolio.json` du repo, sinon rédaction par le LLM (une seule fois) |
| Stack affichée | Topics du repo, traduits par [data/stack_map.json](data/stack_map.json) |
| Arêtes vers les outils | Déduites de la stack (ex. topic `dbt` vers le nœud dbt) |
| Schéma d'architecture | Champ `mermaid` de `portfolio.json`, sinon premier bloc mermaid du README |
| Lien « app en ligne » | Champ `live_url` de `portfolio.json`, sinon champ Website du repo |
| Badge « EN COURS » | Topic `wip` |

Seuls les repos dont le dernier push a changé sont relus. Les fiches sont mises en cache dans `data/projects/`.

## Modèle de `portfolio.json`

```json
{
  "id": "p_mon_projet",
  "order": 50,
  "label": "MON_PROJET",
  "kanji": "新",
  "year": "2026",
  "title_fr": "Titre du projet",
  "title_en": "Project title",
  "summary_fr": "Une à deux phrases qui résument le projet.",
  "summary_en": "One to two sentences summarizing the project.",
  "body_fr": "Le récit : problème, solution, résultat. **Gras** autorisé.\n\nNouveau paragraphe après une ligne vide.",
  "body_en": "The story: problem, solution, result. **Bold** allowed.\n\nNew paragraph after a blank line.",
  "metrics": [
    { "label": "tables", "value": "12" },
    { "label": "tests", "value": "20" },
    { "label": "latence", "value": "<5min" }
  ]
}
```

### Champs obligatoires

| Champ | Règle |
|---|---|
| `label` | Nom de code en MAJUSCULES_AVEC_UNDERSCORES, affiché sur la carte. |
| `kanji` | Un idéogramme japonais qui résume le projet. |
| `year` | Année ou période (`"2026"`, `"2024 → 2026"`). |
| `title_fr`, `title_en` | Titre bilingue. |
| `summary_fr`, `summary_en` | 1 à 2 phrases. |
| `body_fr`, `body_en` | Récit complet : problème, solution, résultat chiffré. |
| `metrics` | Exactement 3 objets `{label, value}`. |

Aucun tiret cadratin dans les textes : la fiche serait refusée.

### Champs optionnels

| Champ | Rôle |
|---|---|
| `id` | Identifiant du nœud (`p_...`). Par défaut, dérivé du nom du repo. |
| `order` | Position dans la colonne MARTS, du plus petit au plus grand. |
| `mermaid` | Schéma d'architecture. Prioritaire sur celui du README. |
| `live_url` | Lien de l'application. Prioritaire sur le champ Website du repo. |
| `live_label_fr`, `live_label_en` | Texte du bouton de l'application. |
| `links` | Liens vers des repos secondaires : `[{ "label_fr", "label_en", "url" }]`. |
| `edges_from` | Nœuds en amont que les topics ne donnent pas (ex. `["t_dim_modeling"]`). |
| `edges_to` | Nœuds en aval, comme une certification (ex. `["c_cdsd"]`). |
| `bot_description` | Résumé du projet pour le chatbot. Par défaut, `summary_fr`. |

Tous les projets sont reliés d'office à Git en amont et à GitHub en aval.

## Ajouter une techno à la stack

Un topic absent de [data/stack_map.json](data/stack_map.json) est ignoré. Pour en ajouter un, insère une ligne :

```json
{ "topic": "kafka", "label": "Kafka", "tool": null }
```

- `label` : le nom affiché sur le site.
- `tool` : le nœud outil auquel relier le projet (`t_python`, `t_sql`, `t_dbt`, `t_airflow`, `t_databricks`, `t_dim_modeling`, `t_docker`, `t_viz`, `t_git`), ou `null`.
- L'ordre de la liste fixe l'ordre d'affichage. Les 3 premières technos apparaissent sur la carte du projet.

## Fiches rédigées par le LLM

Si un repo a le topic `portfolio` mais pas de `portfolio.json`, le workflow ouvre une pull request « Fiches projet rédigées par le LLM, à relire ».

1. Relis le fichier `data/projects/<repo>.json` dans la pull request : textes, métriques, kanji.
2. Corrige directement ce fichier si besoin.
3. Fusionne. Si tu as corrigé la fiche, relance le workflow pour que le site reprenne tes corrections (sinon elles arrivent à la synchronisation de la nuit).

Le LLM ne rédige une fiche qu'une fois. Pour la faire réécrire, supprime son fichier dans `data/projects/`. Pour reprendre la main définitivement, ajoute un `portfolio.json` dans le repo : il remplace la fiche du LLM.

## Tester en local

```powershell
uv run scripts/sync_projects.py --no-llm --dry-run
```

`--dry-run` n'écrit aucun fichier, `--no-llm` n'appelle jamais le LLM, `--force` relit tous les repos même inchangés.

## Ce qui reste manuel

- Les nœuds hors projets (sources, outils, certifications, CV, contact) et les nœuds « PROD · LIVE » se modifient dans `data/pipeline.json`. Un nœud live se relie à son projet par le champ `source_project`.
- Ne modifie pas un nœud projet dans `data/pipeline.json` : il serait écrasé à la synchronisation suivante.
- Les projets connus du chatbot mais absents du site restent dans `data/jb_knowledge.json`.
