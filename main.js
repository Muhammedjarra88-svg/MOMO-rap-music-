// main.js - Player semplice basato su Web Audio API
// Funzionalità: preload, crossfade, EQ presets, waveform, local files

const fileInput = document.getElementById('fileInput');
const dropLabel = document.getElementById('dropLabel');
const playlistEl = document.getElementById('playlist');
const playPauseBtn = document.getElementById('playPauseBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const waveformCanvas = document.getElementById('waveform');
const trackTitle = document.getElementById('trackTitle');
const timeEl = document.getElementById('time');
const seek = document.getElementById('seek');
const crossfade = document.getElementById('crossfade');
const crossfadeVal = document.getElementById('crossfadeVal');
const eqPreset = document.getElementById('eqPreset');

let audioCtx = null;
let masterGain = null;
let eqNodes = [];
const bufferCache = new Map(); // id -> AudioBuffer
const playlist = []; // { id, file, name, duration }
let currentIndex = -1;
let isPlaying = false;
let currentSource = null;
let currentGain = null;
let nextSource = null;
let nextGain = null;
let playbackStartAt = 0; // audioCtx.currentTime when started
let trackOffsetSec = 0; // offset in seconds when starting currentSource
let rafId = null;

crossfade.addEventListener('input', () => {
  crossfadeVal.textContent = `${crossfade.value}s`;
});

// setup file input and drag/drop
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
dropLabel.addEventListener('dragover', (e) => { e.preventDefault(); dropLabel.style.borderColor = '#666'; });
dropLabel.addEventListener('dragleave', () => { dropLabel.style.borderColor = '#333'; });
dropLabel.addEventListener('drop', (e) => { e.preventDefault(); dropLabel.style.borderColor = '#333'; handleFiles(e.dataTransfer.files); });
// also allow clicking the label to open file dialog
dropLabel.addEventListener('click', () => fileInput.click());

function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(audioCtx.destination);
    createEQNodes(); // connect EQ chain into masterGain
  }
}

function createEQNodes() {
  // simple 3-band chain: low shelf, peaking, high shelf
  eqNodes = [
    audioCtx.createBiquadFilter(),
    audioCtx.createBiquadFilter(),
    audioCtx.createBiquadFilter()
  ];
  eqNodes[0].type = 'lowshelf';   // bass
  eqNodes[0].frequency.value = 100;
  eqNodes[1].type = 'peaking';    // mid
  eqNodes[1].frequency.value = 800;
  eqNodes[1].Q.value = 1;
  eqNodes[2].type = 'highshelf';  // highs
  eqNodes[2].frequency.value = 5000;

  // connect chain: last -> masterGain
  eqNodes[0].connect(eqNodes[1]);
  eqNodes[1].connect(eqNodes[2]);
  eqNodes[2].connect(masterGain);
}

// EQ preset convenience
function setEQPreset(name) {
  if (!audioCtx) return;
  if (name === 'flat') {
    eqNodes[0].gain.value = 0;
    eqNodes[1].gain.value = 0;
    eqNodes[2].gain.value = 0;
  } else if (name === 'trap') {
    eqNodes[0].gain.value = 5;   // boost lows
    eqNodes[1].gain.value = -1;  // slight mid cut
    eqNodes[2].gain.value = 2;   // slight highs
  } else if (name === 'afrobeats') {
    eqNodes[0].gain.value = 3;
    eqNodes[1].gain.value = 2;
    eqNodes[2].gain.value = 1;
  }
}

eqPreset.addEventListener('change', (e) => {
  ensureAudioContext();
  setEQPreset(e.target.value);
});

// load files and add to playlist
async function handleFiles(fileList) {
  const files = Array.from(fileList).filter(f => f.type.startsWith('audio/'));
  for (const f of files) {
    const id = crypto.randomUUID();
    playlist.push({ id, file: f, name: f.name, duration: 0 });
    addPlaylistItem(playlist.length - 1);
    // start decoding in background
    decodeAndCache(id, f).catch(err => console.error('decode error', err));
  }
  if (currentIndex === -1 && playlist.length) {
    currentIndex = 0;
    renderTrackInfo();
    drawWaveform(null);
  }
}

// decode file and store AudioBuffer in bufferCache
async function decodeAndCache(id, file) {
  ensureAudioContext();
  const ab = await file.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(ab.slice(0));
  bufferCache.set(id, audioBuffer);
  // update duration in playlist
  const item = playlist.find(p => p.id === id);
  if (item) {
    item.duration = audioBuffer.duration;
    updatePlaylistItemDuration(item);
    if (playlist.indexOf(item) === currentIndex) renderTrackInfo();
  }
  // if next track, no need to block
  return audioBuffer;
}

function addPlaylistItem(index) {
  const item = playlist[index];
  const li = document.createElement('li');
  li.id = `pl-${item.id}`;
  li.textContent = item.name;
  li.addEventListener('click', () => {
    stopPlayback();
    currentIndex = index;
    playCurrent(0);
    highlightPlaylist();
  });
  playlistEl.appendChild(li);
  updatePlaylistItemDuration(item);
}

// update duration text after decode
function updatePlaylistItemDuration(item) {
  const li = document.getElementById(`pl-${item.id}`);
  if (!li) return;
  if (item.duration && item.duration > 0) {
    li.textContent = `${item.name} — ${formatTime(item.duration)}`;
  }
}

function highlightPlaylist() {
  for (const p of playlist) {
    const el = document.getElementById(`pl-${p.id}`);
    if (!el) continue;
    el.classList.toggle('active', playlist.indexOf(p) === currentIndex);
  }
}

// playback control helpers
playPauseBtn.addEventListener('click', async () => {
  if (!audioCtx) ensureAudioContext();
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  if (!isPlaying) {
    if (currentIndex === -1 && playlist.length) currentIndex = 0;
    playCurrent(trackOffsetSec);
  } else {
    pausePlayback();
  }
  highlightPlaylist();
});
prevBtn.addEventListener('click', () => {
  if (!playlist.length) return;
  const prevIndex = Math.max(0, currentIndex - 1);
  stopPlayback();
  currentIndex = prevIndex;
  playCurrent(0);
  highlightPlaylist();
});
nextBtn.addEventListener('click', () => {
  if (!playlist.length) return;
  stopPlayback();
  currentIndex = Math.min(playlist.length - 1, currentIndex + 1);
  playCurrent(0);
  highlightPlaylist();
});

seek.addEventListener('input', (e) => {
  if (!playlist.length || currentIndex === -1) return;
  const pct = e.target.value / 100;
  const item = playlist[currentIndex];
  const targetSec = (item.duration || 0) * pct;
  // implement seek by restarting the buffer at offset
  playCurrent(targetSec);
});

// play current track from offset (seconds)
async function playCurrent(offsetSec = 0) {
  if (!playlist[currentIndex]) return;
  ensureAudioContext();
  // resume user gesture if needed
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  const item = playlist[currentIndex];
  const id = item.id;

  // get decoded buffer, decode if needed
  let buffer = bufferCache.get(id);
  if (!buffer) {
    buffer = await decodeAndCache(id, item.file);
  }

  // stop any existing sources cleanly
  stopSourcesSilently();

  // create source + gain and connect through EQ chain
  currentSource = audioCtx.createBufferSource();
  currentSource.buffer = buffer;
  currentGain = audioCtx.createGain();
  currentGain.gain.value = 1;

  // connect: source -> currentGain -> eqNodes[0]
  currentSource.connect(currentGain);
  currentGain.connect(eqNodes[0]);

  // compute start times
  playbackStartAt = audioCtx.currentTime;
  trackOffsetSec = Math.min(Math.max(0, offsetSec), buffer.duration - 0.0001);

  currentSource.start(playbackStartAt, trackOffsetSec);
  isPlaying = true;
  playPauseBtn.textContent = '⏸';

  // schedule preloading and next track scheduling
  schedulePreloadAndNext();

  // render waveform and progress
  renderTrackInfo();
  drawWaveform(buffer);
  startProgressLoop();
  highlightPlaylist();
}

function schedulePreloadAndNext() {
  const cross = parseFloat(crossfade.value);
  const item = playlist[currentIndex];
  const id = item.id;
  const buffer = bufferCache.get(id);
  if (!buffer) return;

  // preload next buffer
  const nextIndex = currentIndex + 1;
  if (nextIndex < playlist.length) {
    const nextId = playlist[nextIndex].id;
    if (!bufferCache.has(nextId)) {
      decodeAndCache(nextId, playlist[nextIndex].file).catch(console.error);
    }
    // schedule starting the next Source with crossfade
    const timeToEnd = (buffer.duration - trackOffsetSec) - cross;
    if (timeToEnd <= 0) {
      // if cross is longer than track, just schedule immediate start at end
      scheduleStartNextAt(audioCtx.currentTime + Math.max(0, buffer.duration - trackOffsetSec));
    } else {
      scheduleStartNextAt(audioCtx.currentTime + timeToEnd);
    }
  } else {
    // no next track: schedule stop at end
    scheduleStopAt(audioCtx.currentTime + (buffer.duration - trackOffsetSec));
  }
}

function scheduleStartNextAt(when) {
  // create next source but start later
  const nextIndex = currentIndex + 1;
  if (nextIndex >= playlist.length) return;
  const nextItem = playlist[nextIndex];
  const nextBuffer = bufferCache.get(nextItem.id);
  if (!nextBuffer) return; // should not happen if preloaded

  const cross = parseFloat(crossfade.value);

  // create nodes
  nextSource = audioCtx.createBufferSource();
  nextSource.buffer = nextBuffer;
  nextGain = audioCtx.createGain();
  nextGain.gain.value = 0;

  nextSource.connect(nextGain);
  nextGain.connect(eqNodes[0]);

  // schedule start of nextSource at specified time
  nextSource.start(when);

  // apply crossfade ramps:
  // nextGain: ramp 0 -> 1 over cross seconds starting at 'when'
  // currentGain: ramp 1 -> 0 over cross seconds starting at 'when'
  nextGain.gain.setValueAtTime(0, when);
  nextGain.gain.linearRampToValueAtTime(1, when + cross);

  if (currentGain) {
    currentGain.gain.setValueAtTime(currentGain.gain.value, when);
    currentGain.gain.linearRampToValueAtTime(0, when + cross);
  }

  // schedule swap: after when + cross, tear down old source and set indices
  const swapAt = when + cross + 0.05;
  setTimeout(() => {
    // stop old source and move pointers
    try { currentSource.stop(); } catch(e) {}
    currentSource = nextSource;
    currentGain = nextGain;
    nextSource = null; nextGain = null;
    currentIndex = nextIndex;
    // prepare next preloading/scheduling
    schedulePreloadAndNext();
    renderTrackInfo();
    drawWaveform(currentSource.buffer);
  }, (swapAt - audioCtx.currentTime) * 1000);
}

// schedule stop at a time (no next)
function scheduleStopAt(when) {
  // stop current at end; also set up UI to reflect stop
  setTimeout(() => {
    stopPlayback();
  }, (when - audioCtx.currentTime) * 1000);
}

function stopPlayback() {
  if (!isPlaying) return;
  // stop everything
  try { if (currentSource) currentSource.stop(); } catch(e){}
  try { if (nextSource) nextSource.stop(); } catch(e){}
  stopSourcesSilently();
  isPlaying = false;
  playPauseBtn.textContent = '▶️';
  stopProgressLoop();
}

function pausePlayback() {
  if (!isPlaying) return;
  // To pause, we stop the source and record offset
  const elapsed = audioCtx.currentTime - playbackStartAt;
  trackOffsetSec += elapsed;
  try { if (currentSource) currentSource.stop(); } catch(e){}
  isPlaying = false;
  playPauseBtn.textContent = '▶️';
  stopProgressLoop();
}

function stopSourcesSilently() {
  currentSource = null;
  currentGain = null;
  nextSource = null;
  nextGain = null;
}

// UI helpers
function renderTrackInfo() {
  if (!playlist[currentIndex]) {
    trackTitle.textContent = 'Nessuna traccia caricata';
    timeEl.textContent = '00:00 / 00:00';
    return;
  }
  const item = playlist[currentIndex];
  trackTitle.textContent = item.name;
  const dur = (item.duration && item.duration > 0) ? formatTime(item.duration) : '—:—';
  timeEl.textContent = `00:00 / ${dur}`;
}

function startProgressLoop() {
  cancelAnimationFrame(rafId);
  function frame() {
    if (!isPlaying || !playlist[currentIndex]) { rafId = requestAnimationFrame(frame); return; }
    const item = playlist[currentIndex];
    const elapsed = (audioCtx.currentTime - playbackStartAt) + trackOffsetSec;
    const duration = item.duration || 0;
    if (duration > 0) {
      const pct = Math.min(100, (elapsed / duration) * 100);
      seek.value = pct;
      timeEl.textContent = `${formatTime(elapsed)} / ${formatTime(duration)}`;
    }
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
}

function stopProgressLoop() {
  cancelAnimationFrame(rafId);
}

function formatTime(sec) {
  if (!isFinite(sec) || sec <= 0) return '00:00';
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Waveform drawing: downsample buffer to fixed number of columns and draw peaks
function drawWaveform(buffer) {
  const canvas = waveformCanvas;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);

  if (!buffer) {
    ctx.fillStyle = '#222';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#888';
    ctx.font = '14px sans-serif';
    ctx.fillText('Carica una traccia per visualizzare la waveform', 10, 40);
    return;
  }

  const channelData = buffer.getChannelData(0);
  const samplesPerPixel = Math.floor(channelData.length / canvas.width);
  const halfH = canvas.height / 2;

  // draw background
  ctx.fillStyle = '#050506';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // peaks
  ctx.fillStyle = '#00e6a8';
  for (let x = 0; x < canvas.width; x++) {
    const start = x * samplesPerPixel;
    let min = 1.0, max = -1.0;
    for (let j = 0; j < samplesPerPixel; j++) {
      const s = channelData[start + j];
      if (s < min) min = s;
      if (s > max) max = s;
    }
    const yTop = halfH - (max * halfH);
    const yBottom = halfH - (min * halfH);
    ctx.fillRect(x, yTop, 1, Math.max(1, yBottom - yTop));
  }
}

// small helper to format playlist UI durations that may be available
function formatDurationIfKnown(d) {
  return d && d > 0 ? formatTime(d) : '—:—';
}