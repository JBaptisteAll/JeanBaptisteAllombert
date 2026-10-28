# Jean-Baptiste Allombert, Analytics Engineer

👉 **Site : https://jbaptisteall.github.io/JeanBaptisteAllombert/index.html**

Portfolio interactif présenté comme un pipeline de données (DAG) : la donnée brute de mon parcours à gauche, mes projets et certifications au milieu, mon CV et mes contacts à l'arrivée. On clique sur un nœud pour ouvrir son détail, on zoome et on se déplace comme dans un outil d'orchestration.

*De la donnée brute à la donnée fiable.*

## Ce que contient le site

- **5 colonnes** : SOURCES (profil, expériences, formation), PROCESSING (outils et niveaux), MARTS (projets), QUALITY (certifications), SHIP (CV, contact, GitHub, LinkedIn).
- **Fiches projet** : récit problème, solution, résultat, métriques, stack, diagramme d'architecture Mermaid et liens vers le code ou l'application en ligne.
- **Chatbot "JB"** : un avatar qui répond aux questions sur mon parcours, avec une base de connaissances injectée à la demande pour rester léger.
- **Mobile** : navigation par colonnes, pincement pour zoomer.

## Stack

| Couche | Technos |
|---|---|
| Front | React 18 (JSX compilé dans le navigateur par Babel), SVG, CSS |
| Diagrammes | Mermaid |
| Données du site | `data/pipeline.json` (nœuds et arêtes), `data/jb_knowledge.json` (base du chatbot) |
| Chatbot | Cloudflare Worker (proxy), API Groq, logs des questions dans Cloudflare KV |
| Hébergement | GitHub Pages |
| Mesure d'audience | Google Analytics 4 |

## Structure du repo

```
index.html              Point d'entrée
pipeline.jsx            DAG, nœuds, arêtes, tiroir de détail, mobile
pipeline-app.jsx        Chargement des données, langue, montage de l'app
pipeline.css            Styles (thème Neo-Tokyo)
chatbot.jsx             Chatbot et construction du prompt
cloudflare-worker.js    Proxy du chatbot (CORS, rate limit, logs)
image-slot.js           Composant photo de profil
data/pipeline.json      Contenu du portfolio
data/jb_knowledge.json  Connaissances du chatbot
assets/                 CV (PDF) et photo
ADD_PROJECT.md          Guide pour ajouter un projet
```

## Lancer en local

Le site est statique, mais il charge des fichiers JSON : il faut donc un petit serveur local (ouvrir `index.html` directement ne fonctionne pas).

```powershell
uv run python -m http.server 8000
```

Puis ouvrir http://localhost:8000.

## Ajouter ou modifier un projet

Tout le contenu vit dans `data/pipeline.json`, sans toucher au code. Le guide pas à pas est dans [ADD_PROJECT.md](ADD_PROJECT.md).

## Chatbot

Le front envoie la conversation au Worker, qui vérifie l'origine, applique une limite de requêtes et relaie vers Groq. Les consignes de déploiement du Worker (clé API en secret, KV pour les logs) sont en tête de [cloudflare-worker.js](cloudflare-worker.js).

## Contact

- Email : jb.allombert@gmail.com
- LinkedIn : https://www.linkedin.com/in/jean-baptiste-allombert/
- GitHub : https://github.com/JBaptisteAll
