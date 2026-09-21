# LarpLabs V2

Chrome Engine Turbo : jusqu'à 1500 workers Chrome ultra-légers, ~78 sources de proxies gratuits vérifiés x10, stats par pays, 12 presets plateformes, resolver Cloudflare/captcha + OCR, panel temps réel WebSocket.

## Déploiement VPS (Docker)

```bash
cp .env.example .env        # puis mets l'IP du VPS dans VITE_BACKEND_URL
docker compose up -d --build
```

- Web → `http://VPS-IP:3000`
- Backend API → `http://VPS-IP:8000/docs`
- Backend seul : `cd backend && python start.py`

## Development

You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone https://github.com/<ton-user>/larplabs-v2.git
cd larplabs-v2
npm i
npm run dev
# Backend : cd backend && pip install -r requirements.txt && python start.py
```

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

```sh
git clone https://github.com/<ton-user>/larplabs-v2.git
cd larplabs-v2
npm i
npm run dev
# Backend : cd backend && pip install -r requirements.txt && python start.py
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
