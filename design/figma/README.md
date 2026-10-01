# Streamline in Figma

Two things live here: the design tokens, for Figma variables and styles, and the
app's screens and component sheet as HTML files, for bringing in as editable
layers.

## 1. Tokens → variables and styles

`tokens.json` is in the Tokens Studio format: one file with four sets and three
themes.

| Set | Holds |
| --- | --- |
| `global` | Inter type scale and text styles, spacing, radii, control sizes, the RMIT navy ramp |
| `light` | Semantic colours (canvas, surface, card, primary, ring…), the six elevation shadows, the 17-colour label palette |
| `dark` | The same for the dark theme |
| `dim` | Dark with the dim theme's lighter surfaces |

In Figma:

1. Install the **Tokens Studio for Figma** plugin and open it in your file.
2. Settings → Add new storage → **Local document** (or keep it local), then
   **Tools → Load from file/folder or preset → File** and pick `tokens.json`.
3. Under **Themes**, the Light, Dark and Dim themes are already set up.
4. **Styles & Variables → Export styles & variables**: tick Variables (colour,
   number) and Styles (text, effects), and choose the three themes. Each theme
   becomes a mode of the variable collection.

Rebuild after changing `src/app/globals.css`:

```bash
npm run figma:tokens
```

The label palette (`label-palette.json`) is read off the rendered app, since
those colours come from Tailwind's own scale.

## 2. Screens and components → layers

`screens/` holds each main screen in light and dark, plus the component sheet
in all three themes. Every file shares `screens/app.css`. They are made by the
capture step below and are not committed, so regenerate them when the app
changes.

| File | What |
| --- | --- |
| `design-kit-{light,dark,dim}` | Every component and token on one page: colours, labels, type, radii, shadows, buttons, toolbar, tabs, status and priority, tags, sizes, badges, form controls, avatars, task buttons, progress, Kanban card, empty and loading states, menus, strips, link tiles |
| `home`, `my-work`, `dashboard`, `settings`, `sign-in` | The main pages |
| `board-table`, `board-kanban` | A board in the table and the Kanban |
| `task-panel`, `task-popup` | A task beside the board and as a pop-up |
| `booking-form` | The public booking form |
| `phone-home`, `phone-board` | The phone layout, 375 wide |

To bring one into Figma:

1. Serve the folder (the extension cannot read `file://` pages unless you allow it):

   ```bash
   python -m http.server 3220 --directory design/figma/screens
   ```

2. Install the **html.to.design** Chrome extension and its Figma plugin.
3. Open `http://localhost:3220/board-table-light.html` (or any other) in
   Chrome, run the extension, and import. Pick **Desktop 1440** for desktop
   screens and **375** for the phone ones.

Inter must be installed in Figma (it is on Google Fonts) for the text to map.

### Capturing again

With `npm run dev` running and signed in, open the screen in the browser, then
in the DevTools console:

```js
eval(await (await fetch("/api/dev/figma-capture")).text());
await streamlineCapture("board-table-light", { theme: "light" });
await streamlineCapture("board-table-dark", { theme: "dark" });
```

`streamlineCapture` saves the page as it stands into `screens/`, writes
`app.css`, and copies any images. The component sheet is at
`/design-kit?theme=light|dark|dim`. Both it and the capture endpoint exist only
under `next dev`.

The stakeholder portal is not in the set: it needs the live server. Capture it
from a real portal link the same way if you need it.
