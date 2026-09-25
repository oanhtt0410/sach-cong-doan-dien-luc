/* Soft paper effects plus the MP3 supplied by the book owner.
 * The background track streams from this Site only after the reader enables it. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const effectButton = $('paperSound');
  const musicButton = $('backgroundMusic');
  const musicElement = $('readingMusic');
  const volumeInput = $('soundVolume');
  const volumeLabel = $('soundVolumeValue');
  const notice = $('soundNotice');
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let effects = true, music = false, volume = 0.55;
  let ctx, master, paperBus, musicBus, mediaSource, narrationSource;
  let loading = false, narrationActive = false;
  let startGeneration = 0;
  let musicStopTimer;
  const paperVoices = new Set();
  const storedKey = 'evn-union-sound-v1';
  try {
    const saved = JSON.parse(localStorage.getItem(storedKey) || '{}');
    if (typeof saved.effects === 'boolean') effects = saved.effects;
    if (Number.isFinite(saved.volume)) volume = Math.max(0, Math.min(1, saved.volume));
  } catch (_) {}

  function save() {
    try { localStorage.setItem(storedKey, JSON.stringify({ effects, volume })); } catch (_) {}
  }
  function sync() {
    effectButton.textContent = effects ? 'Tiếng lật: Bật' : 'Tiếng lật: Tắt';
    effectButton.setAttribute('aria-pressed', String(effects));
    musicButton.textContent = music ? (loading ? 'Nhạc nền: Đang tải…' : 'Nhạc nền: Bật') : 'Nhạc nền: Tắt';
    musicButton.setAttribute('aria-busy', String(music && loading));
    musicButton.setAttribute('aria-pressed', String(music));
    volumeInput.value = Math.round(volume * 100);
    volumeInput.setAttribute('aria-valuetext', `${Math.round(volume * 100)} phần trăm`);
    volumeLabel.textContent = `${Math.round(volume * 100)}%`;
  }
  function message(text = '') { notice.textContent = text; }
  function createContext() {
    if (!AudioContextClass) return null;
    if (!ctx) {
      ctx = new AudioContextClass();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      paperBus = ctx.createGain();
      paperBus.gain.value = effects ? 1 : 0;
      paperBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0;
      musicBus.connect(master);
    }
    return ctx;
  }
  // Called synchronously from the visitor's click, key press, or swipe.
  async function unlock() {
    const audio = createContext();
    if (!audio) return false;
    if (audio.state !== 'running') await audio.resume();
    return audio.state === 'running';
  }
  function track(source, nodes, collection) {
    collection.add(source);
    source.onended = () => {
      collection.delete(source);
      source.disconnect();
      nodes.forEach(node => node.disconnect());
    };
  }
  function stopVoices(collection) {
    for (const node of collection) { try { node.stop(); } catch (_) {} }
    collection.clear();
  }

  // A single, rounded paper brush: low-pass the hiss and remove sharp transients.
  function paper(dir, shortTurn) {
    const duration = shortTurn ? 0.22 : 0.68;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    let low = 0, smooth = 0, rumble = 0;
    const lowPass = 1 - Math.exp(-2 * Math.PI * 1350 / ctx.sampleRate);
    const highPass = 1 - Math.exp(-2 * Math.PI * 100 / ctx.sampleRate);
    for (let i = 0; i < samples.length; i++) {
      const t = i / (samples.length - 1);
      const white = Math.random() * 2 - 1;
      low += lowPass * (white - low);
      smooth += lowPass * (low - smooth);
      rumble += highPass * (smooth - rumble);
      const fade = Math.sin(Math.PI * t) ** 2;
      const movement = 0.88 + 0.12 * Math.sin(2 * Math.PI * 2 * t);
      samples[i] = (smooth - rumble) * fade * movement;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    const nodes = [gain];
    source.connect(gain);
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      const now = ctx.currentTime;
      pan.pan.setValueAtTime(dir > 0 ? 0.12 : -0.12, now);
      pan.pan.linearRampToValueAtTime(dir > 0 ? -0.12 : 0.12, now + duration);
      gain.connect(pan); pan.connect(paperBus); nodes.push(pan);
    } else gain.connect(paperBus);
    track(source, nodes, paperVoices);
    source.start();
  }
  async function flip(dir, shortTurn = false) {
    if (!effects || volume === 0 || document.hidden) return;
    const requestedAt = performance.now();
    try {
      if (await unlock() && effects && !document.hidden && performance.now() - requestedAt < 300) {
        paper(dir, shortTurn);
        message();
      }
    } catch (_) {
      message('Chạm “Tiếng lật” để bật lại âm thanh.');
    }
  }

  // Route the same-origin MP3 through Web Audio so volume works on phones too.
  function fadeInMusic() {
    if (!musicBus || !music || document.hidden) return;
    const now = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(now);
    musicBus.gain.setValueAtTime(0, now);
    musicBus.gain.linearRampToValueAtTime(narrationActive ? 0.055 : 0.32, now + 0.9);
  }
  function pauseMusic(immediately = false) {
    clearTimeout(musicStopTimer);
    loading = false;
    if (musicBus) {
      musicBus.gain.cancelScheduledValues(ctx.currentTime);
      musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.065);
    }
    if (immediately || document.hidden || !ctx || ctx.state !== 'running') musicElement.pause();
    else musicStopTimer = setTimeout(() => musicElement.pause(), 350);
  }
  async function startMusic() {
    if (!music || document.hidden) return;
    const generation = ++startGeneration;
    clearTimeout(musicStopTimer);
    loading = true; sync();
    try {
      if (!createContext()) throw new Error('Audio unavailable');
      if (!mediaSource) {
        mediaSource = ctx.createMediaElementSource(musicElement);
        mediaSource.connect(musicBus);
      }
      if (musicElement.error) musicElement.load();
      musicBus.gain.cancelScheduledValues(ctx.currentTime);
      musicBus.gain.setValueAtTime(0, ctx.currentTime);
      // Both calls happen before awaiting, inside the original user gesture.
      const ready = unlock();
      const playing = musicElement.play();
      const [unlocked] = await Promise.all([ready, playing]);
      if (generation !== startGeneration || !music || document.hidden) return;
      if (!unlocked) throw new Error('Audio is not ready');
      loading = false; sync(); message(); fadeInMusic();
    } catch (_) {
      if (generation === startGeneration && !document.hidden) {
        music = false; pauseMusic(true); sync();
        message('Chưa phát được nhạc. Anh chị kiểm tra kết nối rồi chạm “Nhạc nền” để thử lại.');
      }
    }
  }
  function toggleMusic() {
    music = !music;
    if (music) startMusic();
    else { ++startGeneration; pauseMusic(); sync(); }
  }
  musicElement.addEventListener('waiting', () => {
    if (music && !document.hidden) { loading = true; sync(); }
  });
  musicElement.addEventListener('playing', () => {
    if (!music || document.hidden) { musicElement.pause(); return; }
    loading = false; sync(); fadeInMusic();
  });
  musicElement.addEventListener('error', () => {
    if (!music) return;
    ++startGeneration; music = false; pauseMusic(true); sync();
    message('Chưa tải được nhạc. Anh chị kiểm tra kết nối rồi bật lại “Nhạc nền”.');
  });
  effectButton.onclick = () => {
    effects = !effects;
    if (paperBus) paperBus.gain.setTargetAtTime(effects ? 1 : 0, ctx.currentTime, 0.015);
    if (!effects) stopVoices(paperVoices);
    save(); sync();
    if (effects) flip(1);
  };
  musicButton.onclick = toggleMusic;
  volumeInput.oninput = () => {
    volume = Math.max(0, Math.min(1, Number(volumeInput.value) / 100));
    if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.025);
    save(); sync();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      ++startGeneration; pauseMusic(true); stopVoices(paperVoices); sync();
    } else if (music) startMusic();
  });
  window.addEventListener('pagehide', () => {
    ++startGeneration; pauseMusic(true); stopVoices(paperVoices);
  });
  window.addEventListener('pageshow', () => {
    if (music && !document.hidden && musicElement.paused) startMusic();
  });
  sync();
  if (!AudioContextClass) {
    effectButton.disabled = musicButton.disabled = volumeInput.disabled = true;
    message('Trình duyệt này chưa hỗ trợ âm thanh. Anh chị vẫn có thể đọc và lật sách.');
  }
  function setNarrationActive(active) {
    narrationActive = !!active;
    if (musicBus && music && !document.hidden) {
      musicBus.gain.cancelScheduledValues(ctx.currentTime);
      musicBus.gain.setTargetAtTime(narrationActive ? 0.055 : 0.32, ctx.currentTime, 0.16);
    }
  }
  function prepareNarrationAudio(element) {
    if (!createContext()) {
      element.volume = volume;
      return Promise.resolve(true);
    }
    if (!narrationSource) {
      narrationSource = ctx.createMediaElementSource(element);
      narrationSource.connect(master);
    }
    return unlock();
  }
  window.BookSound = { flip, setNarrationActive, prepareNarrationAudio };
})();
