# Babylon TrenchFPS (Quake-like prototype)

Browser FPS prototype using **Babylon.js** + **TrenchBroom** `.map` levels.

## Run

```bash
npm install
npm run dev
```

## Controls

- Click canvas: pointer lock
- Mouse: look
- `WASD`: move
- `Space`: jump
- `Left Mouse`: shoot

## Content

- Map: `public/maps/test.map`
- Textures: `public/textures/*.svg`
- WADs: place in `public/wads/*.wad` and set `"wad"` in worldspawn (semicolon-separated)

## TrenchBroom

TrenchBroom game config installed at:
- `C:\Users\agarl\AppData\Roaming\TrenchBroom\games\QuakeJS\GameConfig.cfg`

Entity definitions:
- `C:\Users\agarl\AppData\Roaming\TrenchBroom\games\QuakeJS\QuakeJS.fgd`

In TrenchBroom:
- Add a new game using **Quake JS**.
- Set the game path to `D:\Games\quake-js\public`.
- Save maps to `D:\Games\quake-js\public\maps\`.
