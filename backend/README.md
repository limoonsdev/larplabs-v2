# LarpLabs V2 — Backend

Backend Python/FastAPI ultra-performant pour LarpLabs V2. Il gère jusqu'à **1 500 workers Chrome** simultanés, un pool de proxies multi-sources (~78), un resolver Cloudflare/captcha + OCR, et diffuse les stats en temps réel via WebSocket.

---

## Déploiement VPS (Docker)

```bash
# Depuis la racine du projet :
docker compose up -d --build
# Web   → http://VPS-IP:3000
# API   → http://VPS-IP:8000/docs
```

> Pense à fixer `VITE_BACKEND_URL=http://VPS-IP:8000` (fichier `.env` à la racine,
> copié depuis `.env.example`) **avant** le build pour que le navigateur touche le backend.

---

## Table des matières

1. [Installation](#installation)
2. [Lancement](#lancement)
3. [Architecture](#architecture)
4. [Endpoints REST](#endpoints-rest)
5. [WebSocket](#websocket)
6. [Actions disponibles](#actions-disponibles)
7. [Configuration](#configuration)

---

## Installation

### Prérequis

- Python 3.10+
- Google Chrome ou Chromium installé sur le système
- pip

### Étapes

```bash
# 1. Cloner / accéder au répertoire backend
cd creamyviews-source/backend

# 2. Créer un environnement virtuel (recommandé)
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux / macOS

# 3. Installer les dépendances Python
pip install -r requirements.txt

# 4. (Optionnel) Copier et éditer le fichier d'environnement
copy .env.example .env          # Windows
# cp .env.example .env          # Linux / macOS
```

> **Note :** `nodriver` utilise Chrome/Chromium directement — aucune installation
> de pilote Selenium/Playwright n'est nécessaire. Assurez-vous simplement que
> `chrome` ou `chromium` est dans le PATH système.

---

## Lancement

```bash
python start.py
```

Le serveur démarre sur `http://0.0.0.0:8000`.

- **API REST :** `http://localhost:8000/api/`
- **Documentation Swagger :** `http://localhost:8000/docs`
- **WebSocket panel :** `ws://localhost:8000/ws/panel`

---

## Architecture

```
backend/
├── app/
│   ├── main.py              ← FastAPI app + lifespan + CORS
│   ├── core/
│   │   ├── config.py        ← Settings Pydantic (variables d'environnement)
│   │   ├── proxy_pool.py    ← Pool de proxies hproxy + vetting async
│   │   └── browser.py       ← Launcher Chrome ultra-léger (nodriver)
│   ├── api/
│   │   ├── routes.py        ← Endpoints REST /api/*
│   │   └── websocket.py     ← Handler WS + broadcaster 500ms
│   └── workers/
│       ├── pool.py          ← WorkerPool (max 1500 workers)
│       └── actions.py       ← ActionType enum + ActionExecutor
├── requirements.txt
├── start.py                 ← Point d'entrée uvicorn
└── README.md
```

### Flux de données

```
Frontend (React)
     │
     ├─ REST  ──► /api/*  ──► routes.py ──► worker_pool / proxy_pool
     │
     └─ WS    ──► /ws/panel ──► websocket.py
                                    │
                          broadcast_loop (500ms)
                                    │
                          ┌─────────┴──────────┐
                          │  worker_pool stats  │
                          │  proxy_pool stats   │
                          │  log entries        │
                          └─────────────────────┘
```

### Proxy Pool

Le pool se rafraîchit automatiquement depuis **~78 sources** (voir `app/core/proxy_pool.py → SOURCES`) :
GitHub (monosans, TheSpeedX, proxifly, hproxy, ShiftyTR, ErcinDedeoglu, Zaeem20,
Anonym0us, KangProxy, hideip.me, prxchk, UptimerBot, RX4096, clarketm, hookzof…),
APIs gratuites (proxyscrape, proxy-list.download, pubproxy, geonode, openproxylist)
et pages scannées (fate0, spys.me…).

Chaque proxy est testé contre `http://httpbin.org/ip` avec **10 vérifications
simultanées**, latence mesurée, stats par pays/source/protocole.
Le pool se rafraîchit automatiquement quand il tombe sous la moitié de la cible
ou après 5 minutes (TTL configurable).

### Worker Pool

- Maximum **1 500 workers** simultanés (configurable)
- Maximum **50 instances Chrome** simultanées (guard RAM via `asyncio.Semaphore`)
- Chaque instance Chrome : ~5–15 MB RAM grâce aux flags agressifs
- Chaque worker tourne en boucle infinie (si `repeat: true`)

---

## Endpoints REST

### Sessions

| Méthode | URL | Description |
|---------|-----|-------------|
| `POST` | `/api/session/start` | Démarrer une session |
| `POST` | `/api/session/stop` | Arrêter une session |
| `GET` | `/api/session/status` | Stats de toutes les sessions |
| `GET` | `/api/session/{id}` | Détail d'une session |

#### POST `/api/session/start`

```json
{
  "url": "https://example.com",
  "num_workers": 10,
  "use_proxies": true,
  "repeat": true,
  "think_time_ms": 500,
  "actions": [
    { "type": "scroll", "value": "down", "count": 3, "delay_ms": 200 },
    { "type": "wait", "delay_ms": 1000 },
    { "type": "click", "selector": "#load-more", "count": 1 }
  ]
}
```

**Réponse :**
```json
{
  "ok": true,
  "session_id": "uuid-v4",
  "num_workers": 10,
  "url": "https://example.com"
}
```

#### POST `/api/session/stop`

```json
{ "session_id": "uuid-v4" }
```

### Proxies

| Méthode | URL | Description |
|---------|-----|-------------|
| `GET` | `/api/proxies` | Stats + liste des proxies vivants |
| `POST` | `/api/proxies/refresh` | Forcer un refresh immédiat |

### Workers

| Méthode | URL | Description |
|---------|-----|-------------|
| `GET` | `/api/workers` | Liste de tous les workers actifs |

### Probe

| Méthode | URL | Description |
|---------|-----|-------------|
| `POST` | `/api/probe` | Tester l'accessibilité d'une URL |

```json
{ "url": "https://example.com", "use_proxy": false }
```

---

## WebSocket

Connexion : `ws://localhost:8000/ws/panel`

### Événements reçus du serveur

| Événement | Fréquence | Contenu |
|-----------|-----------|---------|
| `SNAPSHOT` | À la connexion | État complet (stats + workers + logs + proxies) |
| `STATS_UPDATE` | 500ms | Stats agrégées du pool |
| `WORKER_UPDATE` | 500ms | Liste complète des workers |
| `PROXY_UPDATE` | 500ms | Stats du pool de proxies |
| `NEW_LOG` | Temps réel | Entrée de log d'un worker |
| `pong` | En réponse à ping | Keepalive |

### Événements envoyés par le client

| Événement | Description |
|-----------|-------------|
| `ping` | Keepalive → reçoit `pong` |
| `GET_LOGS` | Récupérer tous les logs en mémoire |
| `CLEAR_LOGS` | Vider le buffer de logs |

### Format d'un `NEW_LOG`

```json
{
  "event": "NEW_LOG",
  "data": {
    "id": "uuid",
    "worker_id": "uuid",
    "status_code": 200,
    "ms": 1243,
    "proxy": "http://1.2.3.4:8080",
    "url": "https://example.com",
    "action": "navigate",
    "error": null,
    "timestamp": 1700000000.0
  }
}
```

---

## Actions disponibles

Chaque session peut inclure une liste d'actions exécutées séquentiellement par chaque worker.

| Type | Description | Paramètres clés |
|------|-------------|-----------------|
| `navigate` | Naviguer vers une URL | `value`: URL |
| `click` | Cliquer sur un élément | `selector`, `x`+`y`, `count` (1–5000) |
| `type_text` | Écrire du texte | `selector` (optionnel), `value`: texte |
| `key_press` | Appuyer une touche | `value`: nom de touche (Enter, Tab, F5…) |
| `scroll` | Défiler la page | `value`: "up"/"down"/pixels, `count` |
| `hover` | Survoler un élément | `selector` ou `x`+`y` |
| `wait` | Attendre N ms | `delay_ms` ou `value`: ms |
| `screenshot` | Capturer l'écran | — |
| `back` | Retour navigateur | — |
| `refresh` | Rafraîchir la page | — |

### Exemple complet d'actions

```json
[
  { "type": "navigate", "value": "https://example.com/page" },
  { "type": "wait", "delay_ms": 800 },
  { "type": "scroll", "value": "down", "count": 5, "delay_ms": 300 },
  { "type": "click", "selector": ".btn-primary", "count": 1 },
  { "type": "type_text", "selector": "#search", "value": "hello world", "delay_ms": 80 },
  { "type": "key_press", "value": "Enter" },
  { "type": "wait", "delay_ms": 1500 },
  { "type": "back" }
]
```

---

## Configuration

Toutes les valeurs sont surchargeable via un fichier `.env` à la racine du backend.

| Variable | Défaut | Description |
|----------|--------|-------------|
| `MAX_WORKERS` | `1500` | Nombre max de workers |
| `MAX_CHROME_INSTANCES` | `50` | Chrome simultanés (guard RAM) |
| `PROXY_CACHE_TTL_SECONDS` | `300` | TTL du cache proxy |
| `PROXY_VETTING_TIMEOUT_SECONDS` | `6` | Timeout test proxy |
| `PROXY_MIN_LIVE_COUNT` | `30` | Seuil de refresh auto |
| `PROXY_MAX_FAILURES` | `2` | Échecs avant exclusion |
| `PROXY_VETTING_CONCURRENCY` | `100` | Parallélisme du vetting |
| `WS_BROADCAST_INTERVAL_MS` | `500` | Fréquence broadcast WS |
| `WS_MAX_LOG_ENTRIES` | `1000` | Buffer de logs en RAM |
| `CHROME_HEADLESS` | `true` | Mode headless Chrome |
| `LOG_LEVEL` | `INFO` | Niveau de log |
| `PORT` | `8000` | Port serveur |
| `HOST` | `0.0.0.0` | Interface d'écoute |
