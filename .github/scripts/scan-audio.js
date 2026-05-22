#!/usr/bin/env node
/**
 * .github/scripts/scan-audio.js
 *
 * Scans the audio/ folder and writes tracks.json from scratch.
 * Runs automatically via GitHub Actions on every push to audio/.
 *
 * Filename conventions:
 *   Title.mp3                  →  title only
 *   Artist - Title.mp3         →  artist + title
 *   Artist - Album - Title.mp3 →  artist + album + title
 *
 * Cover art: if a file covers/filename.jpg (or .png) exists
 * alongside the MP3, it is linked automatically.
 */

const fs   = require('fs');
const path = require('path');

const ROOT        = path.join(__dirname, '..', '..');
const AUDIO_DIR   = path.join(ROOT, 'audio');
const COVERS_DIR  = path.join(ROOT, 'covers');
const TRACKS_FILE = path.join(ROOT, 'tracks.json');
const AUDIO_EXTS  = new Set(['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a']);
const COVER_EXTS  = ['.jpg', '.jpeg', '.png', '.webp'];

// Ensure audio dir exists
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  console.log('Created audio/ folder.');
}

// Scan audio files
const audioFiles = fs.readdirSync(AUDIO_DIR)
  .filter(f => {
    // Skip hidden files and non-audio files
    return !f.startsWith('.') && AUDIO_EXTS.has(path.extname(f).toLowerCase());
  })
  .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

console.log(`Found ${audioFiles.length} audio file(s) in audio/`);

if (audioFiles.length === 0) {
  fs.writeFileSync(TRACKS_FILE, '[]\n');
  console.log('tracks.json cleared (no audio files found).');
  process.exit(0);
}

// Build track list fresh from filenames
const tracks = audioFiles.map(filename => {
  const nameNoExt = filename.replace(/\.[^.]+$/, '');
  const parts     = nameNoExt.split(' - ').map(s => s.trim());

  let title, artist, album;

  if (parts.length >= 3) {
    artist = parts[0];
    album  = parts[1];
    title  = parts.slice(2).join(' - ');
  } else if (parts.length === 2) {
    artist = parts[0];
    title  = parts[1];
    album  = '—';
  } else {
    title  = nameNoExt;
    artist = 'Unknown Artist';
    album  = '—';
  }

  // Look for matching cover art in covers/
  let cover = null;
  if (fs.existsSync(COVERS_DIR)) {
    for (const ext of COVER_EXTS) {
      const coverPath = path.join(COVERS_DIR, nameNoExt + ext);
      if (fs.existsSync(coverPath)) {
        cover = `covers/${nameNoExt}${ext}`;
        break;
      }
    }
  }

  const entry = {
    title:    title  || nameNoExt,
    artist:   artist || 'Unknown Artist',
    album:    album  || '—',
    duration: '—',
    file:     `audio/${filename}`,
  };

  if (cover) entry.cover = cover;

  return entry;
});

// Write tracks.json
// NOTE: This file is auto-generated. Do not hand-edit it —
// your changes will be overwritten on the next push.
const output = JSON.stringify(tracks, null, 2) + '\n';
fs.writeFileSync(TRACKS_FILE, output);

console.log(`\n✓ tracks.json written with ${tracks.length} track(s):`);
tracks.forEach((t, i) => {
  const cover = t.cover ? ` [cover: ${t.cover}]` : '';
  console.log(`  ${i + 1}. ${t.artist} — ${t.title}  (${t.file})${cover}`);
});
