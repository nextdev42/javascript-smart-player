const fileInput = document.getElementById('fileInput');
const playlist = document.getElementById('playlist');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const repeatBtn = document.getElementById('repeatBtn');
const volumeSlider = document.getElementById('volume');
const bassSlider = document.getElementById('bass');
const midSlider = document.getElementById('mid');
const trebleSlider = document.getElementById('treble');
const crossfadeInput = document.getElementById('crossfadeDuration');
const trackInfo = document.getElementById('trackInfo');
const progressBar = document.getElementById('progressBar');
const progressContainer = document.getElementById('progressContainer');
const currentTimeDisplay = document.getElementById('currentTime');
const totalTimeDisplay = document.getElementById('totalTime');
const status = document.getElementById('status');
const leftReel = document.getElementById('leftReel');
const rightReel = document.getElementById('rightReel');
const tapeAnimation = document.getElementById('tapeAnimation');

let audioCtx, masterGainNode, bassFilter, midFilter, trebleFilter;
let audioBuffers = [];
let currentIndex = -1;
let isPlaying = false;
let startTime = 0;
let pausedAt = 0;
let animationFrame;
let shuffle = false;
let repeat = false;
let sortableInstance = null;

// Current playing sources (for crossfade)
let playingSources = [];
let crossfadeInProgress = false;

// --- Playlist setup ---
fileInput.addEventListener('change', e => {
  for (const file of Array.from(e.target.files)) {
    const li = document.createElement('li');
    li.textContent = `🎵 ${file.name.replace('.mp3', '')}`;
    li.file = file;
    li.draggable = true;
    playlist.appendChild(li);
  }
  
  // Initialize sortable after adding files
  setTimeout(initializeSortable, 100);
});

// Initialize sortable playlist
function initializeSortable() {
  // Destroy existing instance if it exists
  if (sortableInstance) {
    sortableInstance.destroy();
  }
  
  // Check if Sortable is loaded
  if (typeof Sortable !== 'undefined' && playlist) {
    try {
      sortableInstance = Sortable.create(playlist, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        handle: 'li',
        onStart: function(evt) {
          evt.item.style.opacity = '0.7';
          evt.item.style.transform = 'rotate(2deg)';
        },
        onEnd: function(evt) {
          evt.item.style.opacity = '1';
          evt.item.style.transform = 'none';
          
          // Update current index if the currently playing track was moved
          const playingItem = playlist.querySelector('.playing');
          if (playingItem) {
            currentIndex = Array.from(playlist.children).indexOf(playingItem);
          }
          
          console.log('Playlist reordered, current index:', currentIndex);
        }
      });
      console.log('Sortable initialized successfully');
    } catch (error) {
      console.error('Error initializing sortable:', error);
    }
  } else {
    console.log('Sortable not available, retrying...');
    setTimeout(initializeSortable, 500);
  }
}

// Wait for page load and initialize sortable
window.addEventListener('load', () => {
  setTimeout(initializeSortable, 200);
});

playlist.addEventListener('click', async e => {
  if (e.target.tagName === 'LI') {
    currentIndex = Array.from(playlist.children).indexOf(e.target);
    await playTrack(currentIndex);
  }
});

// --- Audio setup ---
function setupAudio() {
  if (audioCtx) return;
  
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  // Master gain node
  masterGainNode = audioCtx.createGain();
  masterGainNode.gain.value = volumeSlider.value;
  
  // EQ filters
  bassFilter = audioCtx.createBiquadFilter();
  bassFilter.type = 'lowshelf';
  bassFilter.frequency.value = 200;
  
  midFilter = audioCtx.createBiquadFilter();
  midFilter.type = 'peaking';
  midFilter.frequency.value = 1000;
  midFilter.Q.value = 1;
  
  trebleFilter = audioCtx.createBiquadFilter();
  trebleFilter.type = 'highshelf';
  trebleFilter.frequency.value = 3000;
  
  // Connect audio graph
  bassFilter.connect(midFilter);
  midFilter.connect(trebleFilter);
  trebleFilter.connect(masterGainNode);
  masterGainNode.connect(audioCtx.destination);
}

async function loadBuffer(index) {
  if (audioBuffers[index]) return audioBuffers[index];
  const file = playlist.children[index].file;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = await audioCtx.decodeAudioData(arrayBuffer);
  audioBuffers[index] = buffer;
  return buffer;
}

function createAudioSource(buffer) {
  const source = audioCtx.createBufferSource();
  const gainNode = audioCtx.createGain();
  
  source.buffer = buffer;
  source.connect(gainNode);
  gainNode.connect(bassFilter);
  
  return { source, gainNode };
}

// --- Play Track ---
async function playTrack(index, seekPosition = 0) {
  // Stop all current sources
  stopAllSources();
  
  if (!audioCtx) setupAudio();
  
  try {
    const buffer = await loadBuffer(index);
    const { source, gainNode } = createAudioSource(buffer);
    
    // Start playback
    source.start(0, seekPosition);
    gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
    
    // Track this source
    playingSources = [{ source, gainNode }];
    
    startTime = audioCtx.currentTime - seekPosition;
    isPlaying = true;
    crossfadeInProgress = false;
    
    updateUI();
    
    // Handle track ending
    source.onended = () => {
      if (isPlaying && !crossfadeInProgress) {
        nextTrack(true);
      }
    };
    
    spinReels(true);
    
    console.log(`Playing track ${index}: ${playlist.children[index].textContent}`);
    
  } catch (error) {
    console.error('Error playing track:', error);
    status.textContent = 'Error loading riddim';
  }
}

function stopAllSources() {
  playingSources.forEach(({ source, gainNode }) => {
    try {
      source.stop();
    } catch (e) {
      // Source may already be stopped
    }
    try {
      source.disconnect();
      gainNode.disconnect();
    } catch (e) {
      // May already be disconnected
    }
  });
  playingSources = [];
  isPlaying = false;
  crossfadeInProgress = false;
  spinReels(false);
}

function updateUI() {
  const li = playlist.children[currentIndex];
  Array.from(playlist.children).forEach(li => li.classList.remove('playing'));
  if (li) li.classList.add('playing');
  trackInfo.textContent = li ? `♫ ${li.file.name.replace('.mp3', '')} ♫` : 'Select your riddim...';
  if (animationFrame) cancelAnimationFrame(animationFrame);
  updateProgress();
}

function updateProgress() {
  if (playingSources.length === 0 || !playingSources[0].source.buffer) return;
  
  const elapsed = audioCtx.currentTime - startTime;
  const duration = playingSources[0].source.buffer.duration;
  
  progressBar.style.width = Math.min((elapsed / duration) * 100, 100) + '%';
  currentTimeDisplay.textContent = formatTime(elapsed);
  totalTimeDisplay.textContent = formatTime(duration);
  
  // Check for crossfade trigger
  const crossfadeDuration = parseFloat(crossfadeInput.value || '0');
  if (crossfadeDuration > 0 && 
      duration - elapsed <= crossfadeDuration && 
      isPlaying && 
      !crossfadeInProgress &&
      elapsed > 2 && // Prevent immediate crossfade
      playlist.children.length > 1) { // Need at least 2 tracks
    
    console.log(`Triggering crossfade: ${crossfadeDuration}s remaining`);
    crossfadeInProgress = true;
    nextTrack(true);
  }
  
  if (isPlaying) {
    animationFrame = requestAnimationFrame(updateProgress);
  }
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Equal power crossfade function
function equalPowerCrossfade(position) {
  return Math.cos(position * 0.5 * Math.PI);
}

async function performCrossfade(nextIndex, crossfadeDuration) {
  try {
    console.log(`Starting crossfade to track ${nextIndex} (${crossfadeDuration}s)`);
    
    // Load next track buffer
    const nextBuffer = await loadBuffer(nextIndex);
    const { source: nextSource, gainNode: nextGainNode } = createAudioSource(nextBuffer);
    
    const now = audioCtx.currentTime;
    const currentGainNode = playingSources[0].gainNode;
    
    // Set initial gain values
    currentGainNode.gain.cancelScheduledValues(now);
    nextGainNode.gain.cancelScheduledValues(now);
    
    currentGainNode.gain.setValueAtTime(1, now);
    nextGainNode.gain.setValueAtTime(0, now);
    
    // Linear crossfade (simpler and more reliable)
    currentGainNode.gain.linearRampToValueAtTime(0, now + crossfadeDuration);
    nextGainNode.gain.linearRampToValueAtTime(1, now + crossfadeDuration);
    
    // Start the next track
    nextSource.start(0, 0);
    
    // Add new source to playing sources
    playingSources.push({ source: nextSource, gainNode: nextGainNode });
    
    // Set up ended handler for new track
    nextSource.onended = () => {
      if (isPlaying && !crossfadeInProgress) {
        nextTrack(true);
      }
    };
    
    // Clean up old source after crossfade
    setTimeout(() => {
      try {
        if (playingSources.length > 1) {
          const oldSource = playingSources.shift();
          oldSource.source.stop();
          oldSource.source.disconnect();
          oldSource.gainNode.disconnect();
        }
      } catch (e) {
        console.log('Cleanup error (normal):', e.message);
      }
    }, (crossfadeDuration + 0.1) * 1000);
    
    // Update timing for new track
    startTime = audioCtx.currentTime;
    
    status.textContent = `🌊 Dubbing transition (${crossfadeDuration}s) 🌊`;
    setTimeout(() => {
      status.textContent = '';
      crossfadeInProgress = false;
    }, crossfadeDuration * 1000);
    
    return true;
    
  } catch (error) {
    console.error('Crossfade error:', error);
    status.textContent = 'Dub transition failed';
    crossfadeInProgress = false;
    return false;
  }
}

// --- Next/Prev ---
async function nextTrack(auto = false) {
  if (playlist.children.length === 0) return;
  
  let nextIndex;
  if (shuffle) {
    do {
      nextIndex = Math.floor(Math.random() * playlist.children.length);
    } while (nextIndex === currentIndex && playlist.children.length > 1);
  } else {
    nextIndex = currentIndex + 1;
    if (nextIndex >= playlist.children.length) {
      if (repeat) {
        nextIndex = 0;
      } else {
        stopAllSources();
        return;
      }
    }
  }
  
  const crossfadeDuration = parseFloat(crossfadeInput.value || '0');
  
  if (auto && crossfadeDuration > 0 && playingSources.length > 0 && isPlaying) {
    // Perform crossfade
    currentIndex = nextIndex;
    const success = await performCrossfade(nextIndex, crossfadeDuration);
    
    if (success) {
      updateUI();
    } else {
      // Fallback to normal track change
      await playTrack(nextIndex);
    }
  } else {
    // Normal track change
    currentIndex = nextIndex;
    await playTrack(nextIndex);
  }
}

async function prevTrack() {
  if (playlist.children.length === 0) return;
  currentIndex = currentIndex - 1 < 0 ? playlist.children.length - 1 : currentIndex - 1;
  await playTrack(currentIndex);
}

// --- Controls ---
playBtn.addEventListener('click', async () => {
  if (audioCtx && audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  if (!isPlaying) {
    if (currentIndex < 0) currentIndex = 0;
    await playTrack(currentIndex, pausedAt);
    pausedAt = 0;
  }
});

pauseBtn.addEventListener('click', () => {
  if (isPlaying) {
    pausedAt = audioCtx.currentTime - startTime;
    stopAllSources();
  }
});

stopBtn.addEventListener('click', () => {
  stopAllSources();
  pausedAt = 0;
});

nextBtn.addEventListener('click', () => nextTrack(false));
prevBtn.addEventListener('click', prevTrack);

shuffleBtn.addEventListener('click', () => {
  shuffle = !shuffle;
  shuffleBtn.style.background = shuffle ? 'linear-gradient(145deg, #32cd32, #228b22)' : 'linear-gradient(145deg, #333, #444)';
  shuffleBtn.style.borderColor = shuffle ? '#32cd32' : 'transparent';
});

repeatBtn.addEventListener('click', () => {
  repeat = !repeat;
  repeatBtn.style.background = repeat ? 'linear-gradient(145deg, #ff4500, #cc3300)' : 'linear-gradient(145deg, #333, #444)';
  repeatBtn.style.borderColor = repeat ? '#ff4500' : 'transparent';
});

volumeSlider.addEventListener('input', () => {
  if (masterGainNode) {
    masterGainNode.gain.setValueAtTime(volumeSlider.value, audioCtx.currentTime);
  }
});

bassSlider.addEventListener('input', () => {
  if (bassFilter) bassFilter.gain.value = bassSlider.value;
});

midSlider.addEventListener('input', () => {
  if (midFilter) midFilter.gain.value = midSlider.value;
});

trebleSlider.addEventListener('input', () => {
  if (trebleFilter) trebleFilter.gain.value = trebleSlider.value;
});

// --- Enhanced Reel animation ---
function spinReels(on) {
  if (on) {
    leftReel.classList.add('spinning');
    rightReel.classList.add('spinning');
    if (tapeAnimation) tapeAnimation.style.animationPlayState = 'running';
  } else {
    leftReel.classList.remove('spinning');
    rightReel.classList.remove('spinning');
    if (tapeAnimation) tapeAnimation.style.animationPlayState = 'paused';
  }
}

// --- Progress click seek ---
progressContainer.addEventListener('click', e => {
  if (playingSources.length === 0 || !playingSources[0].source.buffer) return;
  
  const rect = progressContainer.getBoundingClientRect();
  const clickPos = (e.clientX - rect.left) / rect.width;
  const seekTime = clickPos * playingSources[0].source.buffer.duration;
  
  pausedAt = seekTime;
  if (isPlaying) {
    playTrack(currentIndex, seekTime);
  }
});

// --- Keyboard shortcuts ---
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return; // Don't interfere with input fields
  
  switch(e.code) {
    case 'Space':
      e.preventDefault();
      if (isPlaying) {
        pauseBtn.click();
      } else {
        playBtn.click();
      }
      break;
    case 'ArrowLeft':
      e.preventDefault();
      prevBtn.click();
      break;
    case 'ArrowRight':
      e.preventDefault();
      nextBtn.click();
      break;
    case 'KeyS':
      e.preventDefault();
      shuffleBtn.click();
      break;
    case 'KeyR':
      e.preventDefault();
      repeatBtn.click();
      break;
  }
});

// --- Initialize ---
if (tapeAnimation) {
  tapeAnimation.style.animationPlayState = 'paused';
}

status.textContent = '🎵 Ready to drop some dub riddims! 🎵';
setTimeout(() => {
  status.textContent = '';
}, 3000);

console.log('DubMaster player initialized');
