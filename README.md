# XO AURA

A responsive tic-tac-toe game with five complete colour themes and a customizable player dashboard, built with vanilla HTML, CSS, and JavaScript. No build step or dependencies required.

## Features
- Responsive player dashboard with five full-interface colour themes
- Play against AI with Easy, Medium, and Pro (minimax) difficulty
- Local two-player mode, quick match and zen presentation modes
- Win-line animation, winning-cell highlight, move hint and undo
- Match statistics, XP/levels, recent history and preferences saved in `localStorage`
- Optional generated Web Audio UI sounds, reduced-effects toggle, keyboard shortcuts
- Keyboard-focusable board cells and accessible labels

## Run locally
Open `index.html` in a modern browser. For a local server, run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy
### GitHub Pages
1. Create a repository and upload `index.html`, `style.css`, `app.js`, `README.md`, and the `images/aura-logo.png` asset.
2. In **Settings → Pages**, choose **Deploy from a branch**.
3. Choose `main` and `/ (root)`, then save.

### Vercel
Import the repository and deploy as a static site. No build command is needed; the output directory is the repository root.

## Notes
- This is a frontend-only project. Player identity is a demo profile; stats are local to the current browser and do not sync across devices.
- Multiplayer is local two-player on the same device, not online matchmaking.
- Google Fonts is loaded from an external CDN; system fallback fonts are provided.
