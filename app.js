document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const audio = document.getElementById('audio-stream');
    const playBtn = document.getElementById('play-pause-btn');
    const volumeSlider = document.getElementById('volume-slider');
    const trackTitle = document.getElementById('track-title');
    const artistName = document.getElementById('artist-name');
    const albumArt = document.getElementById('album-art');
    const liveIndicator = document.getElementById('live-indicator');
    const streamTime = document.getElementById('stream-time');
    const canvas = document.getElementById('visualizer-canvas');
    const ctx = canvas.getContext('2d');

    // State
    let isPlaying = false;
    let audioContext;
    let analyser;
    let source;
    let dataArray;
    let animationId;
    let streamStartTime = 0;
    let timeInterval;

    // Configuration
    const STREAM_URL = 'https://sonic.dattassd.com/8132/stream';
    const METADATA_URL = 'https://sonic.dattassd.com/8132/stream';

    // Initialize Audio Context (must be on user interaction)
    function initAudioContext() {
        if (!audioContext) {
            try {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                analyser = audioContext.createAnalyser();
                analyser.fftSize = 256; // Resolution of bars

                source = audioContext.createMediaElementSource(audio);
                source.connect(analyser);
                analyser.connect(audioContext.destination);

                const bufferLength = analyser.frequencyBinCount;
                dataArray = new Uint8Array(bufferLength);

                drawVisualizer();
            } catch (e) {
                console.warn("CORS or AudioContext error:", e);
                // Fallback visualizer or just ignore
            }
        } else if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
    }

    // Visualizer Loop
    function drawVisualizer() {
        animationId = requestAnimationFrame(drawVisualizer);

        if (!analyser) return;

        analyser.getByteFrequencyData(dataArray);

        // Resize canvas if needed
        if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        }

        const width = canvas.width;
        const height = canvas.height;
        const barWidth = (width / dataArray.length) * 2.5;
        let barHeight;
        let x = 0;

        ctx.clearRect(0, 0, width, height);

        for (let i = 0; i < dataArray.length; i++) {
            barHeight = dataArray[i] * 1.5; // Scale up

            // Gradient color based on height
            const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
            gradient.addColorStop(0, 'rgba(99, 102, 241, 0.2)'); // Primary color low alpha
            gradient.addColorStop(1, 'rgba(168, 85, 247, 0.6)'); // Secondary color higher alpha

            ctx.fillStyle = gradient;

            // Draw rounded bars
            ctx.beginPath();
            ctx.roundRect(x, height - barHeight, barWidth, barHeight, 5);
            ctx.fill();

            x += barWidth + 1;
        }
    }

    // Player Controls
    playBtn.addEventListener('click', () => {
        initAudioContext();

        if (isPlaying) {
            audio.pause();
            playBtn.innerHTML = '<i class="fas fa-play"></i>';
            document.body.classList.remove('playing');
            stopTimer();
        } else {
            // Always reload stream to ensure live playback (avoid resuming buffer)
            audio.src = STREAM_URL;
            audio.load();
            const playPromise = audio.play();

            if (playPromise !== undefined) {
                playPromise.then(_ => {
                    playBtn.innerHTML = '<i class="fas fa-pause"></i>';
                    document.body.classList.add('playing');
                    startTimer();
                })
                    .catch(error => {
                        console.error("Playback failed:", error);
                        playBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
                    });
            }
        }
        isPlaying = !isPlaying;
    });

    volumeSlider.addEventListener('input', (e) => {
        audio.volume = e.target.value;
    });

    // Timer Logic
    function startTimer() {
        streamStartTime = Date.now();
        clearInterval(timeInterval);
        timeInterval = setInterval(updateTime, 1000);
    }

    function stopTimer() {
        clearInterval(timeInterval);
        streamTime.innerText = "00:00";
    }

    function updateTime() {
        const elapsed = Math.floor((Date.now() - streamStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        streamTime.innerText = `${minutes}:${seconds}`;
    }

    // Metadata & Cover Art
    async function fetchMetadata() {
        try {
            // FIX: Use a CORS proxy to bypass browser restrictions when running locally or on different domain
            const proxyUrl = 'https://api.allorigins.win/get?url=';
            const targetUrl = encodeURIComponent(METADATA_URL);

            // Add cache buster to prevent stale data
            const cacheBuster = `&_=${new Date().getTime()}`;

            const response = await fetch(proxyUrl + targetUrl + cacheBuster);
            const data = await response.json();

            // allorigins returns the actual content in the 'contents' field
            if (data.contents) {
                const shoutcastData = JSON.parse(data.contents);
                const currentTrack = shoutcastData.songtitle;

                if (currentTrack) {
                    updateTrackInfo(currentTrack);
                }
            }

        } catch (error) {
            console.log("Metadata fetch error:", error);
        }
    }

    let lastTrackName = "";

    function updateTrackInfo(rawTitle) {
        if (rawTitle === lastTrackName) return;
        lastTrackName = rawTitle;

        // Split "Artist - Title" if possible
        let artist = "Radio Stream";
        let title = rawTitle;

        if (rawTitle.includes(' - ')) {
            const parts = rawTitle.split(' - ');
            artist = parts[0];
            title = parts.slice(1).join(' - ');
        }

        trackTitle.innerText = title;
        artistName.innerText = artist;

        // Fetch Cover Art (using iTunes API as a free alternative)
        fetchCoverArt(artist, title);
    }

    async function fetchCoverArt(artist, title) {
        const query = encodeURIComponent(`${artist} ${title}`);
        try {
            const res = await fetch(`https://itunes.apple.com/search?term=${query}&media=music&limit=1`);
            const data = await res.json();

            if (data.results.length > 0) {
                const artworkUrl = data.results[0].artworkUrl100.replace('100x100', '500x500');
                albumArt.src = artworkUrl;
            } else {
                // Fallback to a simple colored box or different placeholder service if via.placeholder fails
                albumArt.src = "https://placehold.co/300x300/1f2937/ffffff?text=No+Cover";
            }
        } catch (e) {
            console.error("Cover art fetch failed:", e);
            albumArt.src = "https://placehold.co/300x300/1f2937/ffffff?text=Error";
        }
    }

    // Poll metadata every 15 seconds
    setInterval(fetchMetadata, 15000);
    fetchMetadata(); // Initial call
});
