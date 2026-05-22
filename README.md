# Dissington City 🎵

Static MP3 player. Grid layout, CarPlay-ready, installs as a PWA.
Drop MP3s into `audio/`, push to GitHub, the library updates automatically.

---

## Setup (do this once)

### 1. Create the repo and push

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 2. Enable GitHub Pages

Repo → **Settings → Pages → Source: Deploy from branch → main → / (root) → Save**

Your site: `https://YOUR_USERNAME.github.io/YOUR_REPO/`

### 3. Allow the Action to write back to the repo

⚠️ **This step is required or the auto-update won't work.**

Repo → **Settings → Actions → General → Workflow permissions**
→ Select **"Read and write permissions"** → **Save**

---

## Adding music (every time)

```bash
# Copy your MP3 into the audio/ folder
cp "My Song.mp3" audio/

# Commit and push
git add audio/
git commit -m "Add My Song"
git push
```

That's it. GitHub Actions runs automatically (~30 seconds), scans the folder,
writes a fresh `tracks.json`, and commits it back. GitHub Pages redeploys
in another minute or two. Reload the site and your track appears.

---

## Filename convention

The scanner reads metadata from the filename:

| Filename | Artist | Album | Title |
|---|---|---|---|
| `Song Title.mp3` | Unknown Artist | — | Song Title |
| `Artist - Song Title.mp3` | Artist | — | Song Title |
| `Artist - Album - Song Title.mp3` | Artist | Album | Song Title |

---

## Adding cover art (optional)

Put a JPG/PNG in the `covers/` folder with the same base name as the MP3:

```
audio/Radiohead - Creep.mp3
covers/Radiohead - Creep.jpg   ← same name, different extension
```

The scanner links them automatically. The image shows in the grid card,
player bar, lock screen, and CarPlay display.

---

## Troubleshooting

**Tracks not updating after push?**
1. Check the Actions tab in your repo — did the workflow run? Did it succeed?
2. Make sure "Read and write permissions" is enabled (Settings → Actions → General)
3. Hard-refresh the page: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
4. The app re-fetches `tracks.json` whenever you switch back to the tab

**Action runs but commits nothing?**
- The MP3 file was already in `tracks.json` — no change needed, working correctly

**Audio won't play?**
- GitHub Pages serves MP3s as static files — this works out of the box
- File paths in `tracks.json` must match exactly (case-sensitive on Linux)

---

## CarPlay

Open the site in **Safari on iPhone → Share → Add to Home Screen**.
Connect phone to car. Audio goes through car speakers automatically.
Car screen shows track info; steering-wheel buttons skip/pause.
Requires HTTPS — GitHub Pages provides this.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `→` / `←` | Seek ±5 sec |
| `↑` / `↓` | Volume ±5% |
| `N` / `P` | Next / Previous |
| `S` | Shuffle |
| `R` | Repeat cycle |
| `M` | Mute |

---

## File structure

```
audio/          ← drop MP3s here
covers/         ← optional JPG/PNG cover art (same filename as MP3)
icons/          ← PWA icons
index.html
style.css
app.js
sw.js           ← service worker (offline + background audio)
tracks.json     ← auto-generated, do not hand-edit
manifest.json
.github/
  workflows/update-tracks.yml   ← GitHub Action
  scripts/scan-audio.js         ← scanner script
```
