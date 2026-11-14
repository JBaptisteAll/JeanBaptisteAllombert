# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Synchronise les nœuds projets du portfolio avec les repos GitHub.

Principe :
- un repo public portant le topic `portfolio` est publié sur le site ;
- les textes de la fiche viennent du fichier `portfolio.json` du repo,
  sinon ils sont rédigés une seule fois par un LLM puis mis en cache ;
- la stack vient des topics du repo (table data/stack_map.json) ;
- le schéma vient de `portfolio.json`, sinon du premier bloc mermaid du README ;
- seuls les repos dont le dernier push a changé sont retraités.

Usage :
    uv run scripts/sync_projects.py            # synchronisation complète
    uv run scripts/sync_projects.py --no-llm   # sans appel au LLM
    uv run scripts/sync_projects.py --dry-run  # n'écrit aucun fichier
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

OWNER = "JBaptisteAll"
PUBLISH_TOPIC = "portfolio"
WIP_TOPIC = "wip"

ROOT = Path(__file__).resolve().parent.parent
PIPELINE_PATH = ROOT / "data" / "pipeline.json"
STACK_MAP_PATH = ROOT / "data" / "stack_map.json"
CACHE_DIR = ROOT / "data" / "projects"
STATE_PATH = CACHE_DIR / "_state.json"
ORDER_PATH = ROOT / "data" / "projects_order.txt"

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "openai/gpt-oss-120b"
README_MAX_CHARS = 12000

TEXT_FIELDS = [
    "label", "kanji", "year",
    "title_fr", "title_en",
    "summary_fr", "summary_en",
    "body_fr", "body_en",
]
EM_DASH = chr(0x2014)  # tiret cadratin, interdit dans les textes


# ============================================================
#  Accès réseau
# ============================================================
def http_get(url: str, accept: str | None = None) -> bytes | None:
    """Télécharge une URL. Retourne None si la ressource n'existe pas (404)."""
    headers = {"User-Agent": "portfolio-sync"}
    if accept:
        headers["Accept"] = accept
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token and url.startswith("https://api.github.com/"):
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise


def list_repos() -> list[dict]:
    """Liste les repos publics du compte (topics, homepage et pushed_at inclus)."""
    repos: list[dict] = []
    page = 1
    while True:
        url = f"https://api.github.com/users/{OWNER}/repos?per_page=100&type=owner&page={page}"
        raw = http_get(url, accept="application/vnd.github+json")
        batch = json.loads(raw) if raw else []
        repos.extend(batch)
        if len(batch) < 100:
            return repos
        page += 1


def fetch_portfolio_file(repo: dict, local_dir: Path | None) -> dict | None:
    """Lit le portfolio.json du repo (ou sa version locale en mode test)."""
    if local_dir:
        local_file = local_dir / repo["name"] / "portfolio.json"
        if local_file.exists():
            return json.loads(local_file.read_text(encoding="utf-8"))
    url = f"https://raw.githubusercontent.com/{OWNER}/{repo['name']}/{repo['default_branch']}/portfolio.json"
    raw = http_get(url)
    return json.loads(raw.decode("utf-8")) if raw else None


def fetch_readme(repo: dict) -> str:
    url = f"https://api.github.com/repos/{OWNER}/{repo['name']}/readme"
    raw = http_get(url, accept="application/vnd.github.raw")
    return raw.decode("utf-8", errors="replace") if raw else ""


# ============================================================
#  Fiche projet : extraction, rédaction LLM, validation
# ============================================================
def extract_mermaid(readme: str) -> str | None:
    """Retourne le premier bloc mermaid du README, s'il existe."""
    match = re.search(r"```mermaid\s*\n(.*?)```", readme, flags=re.S)
    return match.group(1).strip() if match else None


def strip_em_dashes(value):
    """Retire les tirets longs d'une valeur (récursif sur listes et dicts).

    Traite le tiret cadratin et le tiret moyen, collés aux mots ou non, et
    normalise les traits d'union et apostrophes typographiques que les LLM
    glissent dans le texte (end-to-end, Docker-Compose, l'outil).
    """
    if isinstance(value, str):
        en_dash = chr(0x2013)
        value = value.replace(chr(0x2011), "-").replace(chr(0x2010), "-").replace(chr(0x2019), "'")
        value = re.sub(rf"\s*{EM_DASH}\s*", ", ", value)
        value = re.sub(rf"(?<=\d){en_dash}(?=\d)", "-", value)  # intervalle : 2024-2026
        value = re.sub(rf"\s*{en_dash}\s*", ", ", value)
        return re.sub(r"[ \t]+\n", "\n", value)
    if isinstance(value, list):
        return [strip_em_dashes(item) for item in value]
    if isinstance(value, dict):
        return {key: strip_em_dashes(item) for key, item in value.items()}
    return value


def generate_with_llm(repo: dict, readme: str, stack_labels: list[str]) -> dict:
    """Rédige la fiche à partir du README via l'API Groq (format OpenAI)."""
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY absent")

    system_prompt = (
        "Tu rédiges la fiche d'un projet data pour le portfolio de Jean-Baptiste Allombert, "
        "Analytics Engineer. Tu écris à la première personne, ton direct et concret, sans superlatifs.\n"
        "RÈGLES STRICTES :\n"
        "- Utilise UNIQUEMENT les informations du README fourni. N'invente rien : aucun chiffre, "
        "aucun résultat, aucune techno absente du README.\n"
        "- Jamais de tiret cadratin. Utilise une virgule, un point ou deux-points.\n"
        "- Si le README présente le projet comme un exercice, un test ou un cas fictif, dis-le "
        "clairement. Ne le présente jamais comme une mission pour un vrai client.\n"
        "- Ne cite aucun organisme, école, entreprise, client ou personne, même si le README les nomme.\n"
        "- Réponds par un objet JSON et rien d'autre, avec exactement ces clés :\n"
        '  "label" : nom de code court en MAJUSCULES_AVEC_UNDERSCORES (2 mots maximum)\n'
        '  "kanji" : un seul idéogramme japonais qui résume le projet\n'
        '  "summary_fr", "summary_en" : 1 à 2 phrases\n'
        '  "body_fr", "body_en" : synthèse courte en 2 à 3 paragraphes, 150 mots maximum au total, '
        "séparés par une ligne vide, **gras** autorisé. Donne le contexte, l'idée clé de la solution "
        "et le résultat. Ne décris pas chaque étape technique une par une : le détail reste sur GitHub.\n"
        '  "metrics" : exactement 3 objets {"label", "value"}. Le label est en minuscules, '
        "2 mots et 15 caractères maximum (ex. \"tables\", \"CA analysé\"). La value est très courte. "
        "Les valeurs chiffrées doivent figurer telles quelles dans le README. Sans chiffre fiable, "
        "utilise une valeur descriptive (ex. le type de base ou d'orchestration).\n"
        '  "bot_description" : 2 phrases en français résumant le projet\n'
    )
    # Schéma proposé par le LLM uniquement si le README n'en contient pas déjà un
    needs_diagram = extract_mermaid(readme) is None
    if needs_diagram:
        system_prompt += (
            '  "mermaid" : schéma d\'architecture en syntaxe Mermaid, commençant par "flowchart LR", '
            "6 boîtes maximum, uniquement les étapes décrites dans le README, libellés courts "
            "sous la forme A[Libellé avec espaces], sans guillemets ni parenthèses dans les libellés\n"
        )
    user_prompt = (
        f"Repo : {repo['name']}\n"
        f"Description GitHub : {repo.get('description') or '(aucune)'}\n"
        f"Stack déclarée : {', '.join(stack_labels) or '(aucune)'}\n\n"
        f"README :\n{readme[:README_MAX_CHARS]}"
    )
    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
        "response_format": {"type": "json_object"},
    }
    request = urllib.request.Request(
        GROQ_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "portfolio-sync",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            data = json.loads(response.read())
    except urllib.error.HTTPError as error:
        # Le corps de la réponse contient la raison précise du refus
        detail = error.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"Groq {error.code} : {detail}") from error
    fiche = json.loads(data["choices"][0]["message"]["content"])
    # L'année n'est jamais demandée au LLM : elle vient de la date de création du repo
    fiche["year"] = repo["created_at"][:4]
    # Le titre reprend toujours le nom du repo, jamais une reformulation du LLM
    fiche["title_fr"] = fiche["title_en"] = re.sub(r"[_-]+", " ", repo["name"]).strip()
    # Un schéma inattendu ou mal formé est écarté plutôt que publié
    diagram = fiche.get("mermaid")
    if not needs_diagram or not isinstance(diagram, str) or not diagram.strip().startswith("flowchart"):
        fiche.pop("mermaid", None)
    return strip_em_dashes(fiche)


def validate_fiche(fiche: dict) -> list[str]:
    """Retourne la liste des problèmes d'une fiche (vide si elle est valide)."""
    errors: list[str] = []
    for field in TEXT_FIELDS:
        if not isinstance(fiche.get(field), str) or not fiche[field].strip():
            errors.append(f"champ manquant ou vide : {field}")
    metrics = fiche.get("metrics")
    if not isinstance(metrics, list) or len(metrics) != 3:
        errors.append("il faut exactement 3 métriques")
    elif any(not isinstance(m, dict) or not m.get("label") or not m.get("value") for m in metrics):
        errors.append("chaque métrique doit avoir un label et une value")
    for link in fiche.get("links", []):
        if not all(link.get(key) for key in ("label_fr", "label_en", "url")):
            errors.append("chaque lien doit avoir label_fr, label_en et url")
    if EM_DASH in json.dumps(fiche, ensure_ascii=False):
        errors.append("tiret cadratin interdit")
    return errors


def load_json(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def load_display_order() -> list[str]:
    """Lit l'ordre d'affichage : un nom de repo par ligne.

    Format texte volontairement simple (pas de JSON) pour être modifiable à la
    main sans risque de casser la synchro. Lignes vides et commentaires (#) ignorés.
    """
    if not ORDER_PATH.exists():
        return []
    lines = ORDER_PATH.read_text(encoding="utf-8").splitlines()
    names = [line.strip().strip('",') for line in lines]
    return [name for name in names if name and not name.startswith("#")]


def write_json(path: Path, content) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(content, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def resolve_fiche(repo: dict, state: dict, args, stack_labels: list[str]) -> dict | None:
    """Trouve la fiche d'un repo : cache si rien n'a bougé, sinon repo, sinon LLM.

    Retourne l'entrée de cache {source, fiche, readme_mermaid}, ou None si indisponible.
    source vaut "repo" (portfolio.json) ou "llm" (rédaction automatique).
    """
    name = repo["name"]
    cache_path = CACHE_DIR / f"{name}.json"
    cached = load_json(cache_path, None)
    unchanged = state.get(name, {}).get("pushed_at") == repo["pushed_at"]

    if cached and unchanged and not args.force and not args.local_dir:
        return cached

    readme = None
    fiche = fetch_portfolio_file(repo, args.local_dir)
    source = "repo"
    if fiche is None:
        if cached:
            # Fiche déjà connue (rédigée par le LLM, ou portfolio.json momentanément
            # introuvable) : on garde le texte. Supprimer le fichier de cache force
            # une nouvelle rédaction.
            fiche, source = cached["fiche"], cached["source"]
        elif args.no_llm:
            print(f"  [ignoré] {name} : pas de portfolio.json et LLM désactivé")
            return None
        else:
            print(f"  [llm] {name} : rédaction de la fiche à partir du README")
            readme = fetch_readme(repo)
            try:
                fiche = generate_with_llm(repo, readme, stack_labels)
            except Exception as error:  # le LLM ne doit jamais casser la synchro
                print(f"  [erreur] {name} : appel LLM en échec ({error})")
                return None
            source = "llm"
            args.new_llm.append(name)

    errors = validate_fiche(fiche)
    if errors:
        print(f"  [invalide] {name} : " + " ; ".join(errors))
        # On retombe sur la dernière version valide connue
        return cached

    # Le README n'est lu que si la fiche n'apporte pas son propre schéma
    readme_mermaid = None
    if not fiche.get("mermaid"):
        readme_mermaid = extract_mermaid(readme if readme is not None else fetch_readme(repo))

    entry = {"source": source, "fiche": fiche, "readme_mermaid": readme_mermaid}
    if not args.dry_run:
        write_json(cache_path, entry)
    state[name] = {"pushed_at": repo["pushed_at"]}
    return entry



# ============================================================
#  Construction des nœuds et arêtes
# ============================================================
def project_id(repo_name: str, fiche: dict) -> str:
    if fiche.get("id"):
        return fiche["id"]
    slug = re.sub(r"[^a-z0-9]+", "_", repo_name.lower()).strip("_")
    return f"p_{slug[:30]}"


def resolve_stack(topics: list[str], stack_map: list[dict]) -> tuple[list[str], list[str]]:
    """Traduit les topics en (noms affichés, nœuds outils), dans l'ordre de la table."""
    labels: list[str] = []
    tools: list[str] = []
    for entry in stack_map:
        if entry["topic"] not in topics:
            continue
        if entry["label"] not in labels:
            labels.append(entry["label"])
        if entry["tool"] and entry["tool"] not in tools:
            tools.append(entry["tool"])
    return labels, tools


def build_node(repo: dict, fiche: dict, stack_labels: list[str], readme_mermaid: str | None) -> dict:
    node = {
        "id": project_id(repo["name"], fiche),
        "type": "project",
        "lane": "MARTS",
        "row": 0,
        "auto": True,
        "repo": repo["name"],
    }
    if WIP_TOPIC in repo.get("topics", []):
        node["wip"] = True
    for field in TEXT_FIELDS:
        node[field] = fiche[field]
    node["stack"] = stack_labels
    node["metrics"] = fiche["metrics"]
    node["github_url"] = repo["html_url"]
    live_url = fiche.get("live_url") or repo.get("homepage")
    if live_url:
        node["live_url"] = live_url
    for optional in ("live_label_fr", "live_label_en", "links", "bot_description"):
        if fiche.get(optional):
            node[optional] = fiche[optional]
    mermaid = fiche.get("mermaid") or readme_mermaid
    if mermaid:
        node["mermaid"] = mermaid
    return node


def build_edges(node: dict, fiche: dict, tools: list[str], valid_ids: set[str]) -> list[list[str]]:
    """Arêtes d'un projet : outils en amont, GitHub et cibles déclarées en aval."""
    upstream = list(dict.fromkeys(tools + fiche.get("edges_from", []) + ["t_git"]))
    downstream = list(dict.fromkeys(fiche.get("edges_to", []) + ["s_github"]))
    edges = [[source, node["id"]] for source in upstream if source in valid_ids]
    edges += [[node["id"], target] for target in downstream if target in valid_ids]
    return edges


def update_pipeline(pipeline: dict, projects: list[dict], edges_by_project: dict[str, list]) -> dict:
    """Remplace les nœuds projets et toutes les arêtes qui les touchent."""
    old_project_ids = {n["id"] for n in pipeline["nodes"] if n["type"] == "project"}
    new_project_ids = {n["id"] for n in projects}
    all_project_ids = old_project_ids | new_project_ids

    # Les projets gardent leur place dans la liste des nœuds (diffs lisibles)
    nodes: list[dict] = []
    inserted = False
    for node in pipeline["nodes"]:
        if node["type"] == "project":
            if not inserted:
                nodes.extend(projects)
                inserted = True
            continue
        nodes.append(node)
    if not inserted:
        nodes.extend(projects)

    edges = [e for e in pipeline["edges"] if e[0] not in all_project_ids and e[1] not in all_project_ids]
    for project in projects:
        edges.extend(edges_by_project[project["id"]])
    # Nœuds "PROD · LIVE" : reliés à leur projet source s'il est publié
    for node in nodes:
        source = node.get("source_project")
        if node["type"] == "live_status" and source in new_project_ids:
            edges.append([source, node["id"], "live"])

    return {**pipeline, "nodes": nodes, "edges": edges}


# ============================================================
#  Programme principal
# ============================================================
def parse_args():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--no-llm", action="store_true", help="ne jamais appeler le LLM")
    parser.add_argument("--dry-run", action="store_true", help="n'écrit aucun fichier")
    parser.add_argument("--force", action="store_true", help="retraite tous les repos, même inchangés")
    parser.add_argument("--local-dir", type=Path, help="dossier de test contenant <repo>/portfolio.json")
    args = parser.parse_args()
    args.new_llm = []  # repos dont la fiche vient d'être rédigée par le LLM
    return args


def main() -> int:
    args = parse_args()
    stack_map = load_json(STACK_MAP_PATH, {})["topics"]
    pipeline = load_json(PIPELINE_PATH, None)
    state = load_json(STATE_PATH, {})
    display_order = load_display_order()

    repos = [r for r in list_repos() if not r["private"] and PUBLISH_TOPIC in r.get("topics", [])]
    print(f"{len(repos)} repo(s) avec le topic '{PUBLISH_TOPIC}'")

    valid_ids = {n["id"] for n in pipeline["nodes"] if n["type"] != "project"}
    entries = []
    for repo in repos:
        labels, tools = resolve_stack(repo["topics"], stack_map)
        entry = resolve_fiche(repo, state, args, labels)
        if entry is None:
            continue
        fiche = entry["fiche"]
        node = build_node(repo, fiche, labels, entry.get("readme_mermaid"))
        # Ordre d'affichage : position dans projects_order.txt, sinon à la fin
        if repo["name"] in display_order:
            rank = (0, display_order.index(repo["name"]), "")
        else:
            rank = (1, fiche.get("order", 999), repo["name"].lower())
        entries.append((rank, repo["name"].lower(), node, fiche, tools))
        print(f"  [ok] {repo['name']} -> {node['id']} ({entry['source']}) : {', '.join(labels) or 'stack vide'}")

    entries.sort(key=lambda item: (item[0], item[1]))
    projects, edges_by_project = [], {}
    for row, (_, _, node, fiche, tools) in enumerate(entries):
        node["row"] = row
        projects.append(node)
        edges_by_project[node["id"]] = build_edges(node, fiche, tools, valid_ids)

    new_pipeline = update_pipeline(pipeline, projects, edges_by_project)
    # Un repo qui perd le topic sort de l'état, mais sa fiche en cache est conservée
    published = {repo["name"] for repo in repos}
    state = {name: value for name, value in state.items() if name in published}

    changed = new_pipeline != pipeline
    print(f"{len(projects)} projet(s) publié(s), {'modifications détectées' if changed else 'aucun changement'}")
    if args.new_llm:
        print("Fiches rédigées par le LLM, à relire : " + ", ".join(args.new_llm))
    if not args.dry_run:
        if changed:
            write_json(PIPELINE_PATH, new_pipeline)
        write_json(STATE_PATH, state)

    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as output:
            output.write(f"llm_used={'true' if args.new_llm else 'false'}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
