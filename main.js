const audio = document.getElementById('audio-player');
const playBtn = document.getElementById('play-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const titleEl = document.getElementById('current-title');
const artistEl = document.getElementById('current-artist');
const progressBar = document.getElementById('progress-bar');
const progressContainer = document.getElementById('progress-container');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');
const spinningIcon = document.querySelector('.spinning-icon');
const playlistItems = document.querySelectorAll('.playlist-item');

let currentTrackIndex = 0;
const tracks = Array.from(playlistItems);

function loadTrack(index) {
    const track = tracks[index];
    const src = track.getAttribute('data-src');
    const title = track.getAttribute('data-title');
    const artist = track.getAttribute('data-artist');

    audio.src = src;
    titleEl.textContent = title;
    artistEl.textContent = artist;

    playlistItems.forEach(item => item.classList.remove('active'));
    track.classList.add('active');
    currentTrackIndex = index;
}

function playTrack() {
    audio.play();
    playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    spinningIcon.classList.add('playing');
}

function pauseTrack() {
    audio.pause();
    playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    spinningIcon.classList.remove('playing');
}

playBtn.addEventListener('click', () => {
    if (!audio.src) {
        loadTrack(0);
    }
    if (audio.paused) {
        playTrack();
    } else {
        pauseTrack();
    }
});

playlistItems.forEach((item, index) => {
    item.addEventListener('click', () => {
        loadTrack(index);
        playTrack();
    });
});

nextBtn.addEventListener('click', () => {
    currentTrackIndex = (currentTrackIndex + 1) % tracks.length;
    loadTrack(currentTrackIndex);
    playTrack();
});

prevBtn.addEventListener('click', () => {
    currentTrackIndex = (currentTrackIndex - 1 + tracks.length) % tracks.length;
    loadTrack(currentTrackIndex);
    playTrack();
});

audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
        const progressPercent = (audio.currentTime / audio.duration) * 100;
        progressBar.style.width = `${progressPercent}%`;

        let currentMinutes = Math.floor(audio.currentTime / 60);
        let currentSeconds = Math.floor(audio.currentTime % 60);
        if (currentSeconds < 10) currentSeconds = `0${currentSeconds}`;
        currentTimeEl.textContent = `${currentMinutes}:${currentSeconds}`;

        let durationMinutes = Math.floor(audio.duration / 60);
        let durationSeconds = Math.floor(audio.duration % 60);
        if (durationSeconds < 10) durationSeconds = `0${durationSeconds}`;
        if (!isNaN(durationMinutes)) {
            durationEl.textContent = `${durationMinutes}:${durationSeconds}`;
        }
    }
});

progressContainer.addEventListener('click', (e) => {
    const width = progressContainer.clientWidth;
    const clickX = e.offsetX;
    const duration = audio.duration;
    if (duration) {
        audio.currentTime = (clickX / width) * duration;
    }
});

audio.addEventListener('ended', () => {
    nextBtn.click();
});

// Carica il primo brano all'avvio (senza riprodurlo automaticamente)
loadTrack(0);
