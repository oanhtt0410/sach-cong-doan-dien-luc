/* Per-page Vietnamese recordings: Nam Minh and Hoai My. No live paid TTS calls. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const audio = $('narrationAudio');
  const panel = $('narrationPanel'), toggle = $('narrationToggle');
  const voiceChoice = $('narrationVoice'), pageChoice = $('narrationPage');
  const play = $('narrationPlay'), pause = $('narrationPause'), stop = $('narrationStop');
  const speed = $('narrationRate'), status = $('narrationStatus');
  let voice = 'female', rate = 1, visiblePages = [], selectedPage = 1;
  let state = 'idle', followPages = false, generation = 0, turning = false, startTimer;
  try {
    const saved = JSON.parse(localStorage.getItem('evn-union-recorded-narration-v1') || '{}');
    if (['male','female'].includes(saved.voice)) voice = saved.voice;
    if ([0.85,1,1.1].includes(saved.rate)) rate = saved.rate;
  } catch (_) {}
  voiceChoice.value = voice; speed.value = rate;
  audio.playbackRate = rate; audio.preservesPitch = true;
  function save() {
    try {localStorage.setItem('evn-union-recorded-narration-v1',JSON.stringify({voice,rate}));} catch (_) {}
  }
  function duck(active) {window.BookSound?.setNarrationActive(active);}
  function sync() {
    play.disabled = turning;
    pause.disabled = !['playing','paused'].includes(state);
    pause.textContent = state === 'paused' ? 'Tiếp tục' : 'Tạm dừng';
    play.textContent = state === 'playing' ? 'Đọc lại' : 'Đọc trang này';
    stop.disabled = !followPages && state === 'idle';
    toggle.setAttribute('data-speaking',String(state === 'playing'));
    play.setAttribute('aria-busy',String(state === 'loading'));
  }
  function cancelAudio() {
    ++generation; clearTimeout(startTimer); audio.pause(); duck(false);
  }
  function stopReading(message = 'Đã dừng đọc.') {
    cancelAudio(); followPages = false; state = 'idle';
    status.textContent = message; sync();
  }
  function failed(token) {
    if (token !== generation) return;
    stopReading('Chưa tải được giọng đọc. Hãy kiểm tra kết nối rồi bấm Đọc trang này để thử lại.');
  }
  async function begin(reset) {
    if (turning || document.hidden) return;
    const token = ++generation;
    clearTimeout(startTimer); audio.pause(); duck(false);
    followPages = true; state = 'loading'; sync();
    status.textContent = `Đang mở giọng ${voice === 'male' ? 'nam' : 'nữ'} · Trang ${selectedPage}…`;
    if (reset) {
      const source = `audio/narration/${voice}/page-${String(selectedPage).padStart(2,'0')}.mp3`;
      if (audio.getAttribute('src') !== source || audio.error) audio.setAttribute('src',source);
      else audio.currentTime = 0;
    }
    audio.playbackRate = rate;
    try {
      // Start both within the original click; the promise also covers network loading.
      const ready = window.BookSound?.prepareNarrationAudio(audio) || Promise.resolve(true);
      const playing = audio.play();
      const [unlocked] = await Promise.all([ready,playing]);
      if (token !== generation || !followPages || document.hidden) return;
      if (!unlocked) throw new Error('Audio output suspended');
      state = 'playing'; duck(true); sync();
      status.textContent = `Đang đọc trang ${selectedPage}.`;
    } catch (_) {if (!document.hidden) failed(token);}
  }
  function setPages(pages,focus) {
    if (!pages?.length) return;
    const changed = pages.join(',') !== visiblePages.join(',') || (pages.includes(focus) && focus !== selectedPage);
    const wasPaused = state === 'paused';
    visiblePages = pages;
    if (pages.includes(focus)) selectedPage = focus;
    else if (!pages.includes(selectedPage)) selectedPage = pages[0];
    pageChoice.replaceChildren();
    for (const n of pages) {
      const option = document.createElement('option');option.value=n;option.textContent=`Trang ${n}`;pageChoice.append(option);
    }
    pageChoice.value=selectedPage;pageChoice.disabled=pages.length===1;
    if (changed) {
      const continueReading = followPages && !wasPaused && !document.hidden;
      cancelAudio();state='idle';
      if (continueReading) {
        const token = generation;
        startTimer=setTimeout(()=>{if(token===generation&&followPages)begin(true)},120);
      } else {followPages=false;status.textContent=`Sẵn sàng đọc trang ${selectedPage}.`;}
    }
    sync();
  }
  toggle.onclick=()=>{
    panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));
    if(panel.hidden)stopReading();
    else{setPages(window.__reader.pages);voiceChoice.focus();}
  };
  play.onclick=()=>begin(true);
  pause.onclick=()=>{
    if(state==='playing'){
      cancelAudio();state='paused';status.textContent=`Đã tạm dừng ở trang ${selectedPage}.`;sync();
    } else if(state==='paused')begin(false);
  };
  stop.onclick=()=>stopReading();
  voiceChoice.onchange=()=>{
    voice=voiceChoice.value;save();
    if(followPages&&state!=='paused')begin(true);
    else stopReading(`Đã chọn giọng ${voice==='male'?'nam':'nữ'}.`);
  };
  speed.onchange=()=>{rate=Number(speed.value);audio.playbackRate=rate;save();};
  pageChoice.onchange=()=>{
    const next=Number(pageChoice.value);if(!visiblePages.includes(next))return;
    const continueReading=followPages&&state!=='paused';cancelAudio();selectedPage=next;state='idle';
    if(continueReading)begin(true);else stopReading(`Sẵn sàng đọc trang ${selectedPage}.`);
  };
  audio.addEventListener('playing',()=>{
    if(!followPages||document.hidden||turning||state==='paused'||state==='idle'){audio.pause();return;}
    state='playing';duck(true);status.textContent=`Đang đọc trang ${selectedPage}.`;sync();
  });
  audio.addEventListener('waiting',()=>{
    if(followPages&&state!=='paused'&&!turning){state='loading';status.textContent=`Đang tải lời đọc trang ${selectedPage}…`;sync();}
  });
  audio.addEventListener('ended',()=>{
    if(!followPages)return;state='finished';duck(false);status.textContent=`Đã đọc hết trang ${selectedPage}. Lật trang để nghe tiếp.`;sync();
  });
  audio.addEventListener('error',()=>{if(followPages)failed(generation);});
  window.addEventListener('bookpageturn',()=>{turning=true;cancelAudio();sync();});
  window.addEventListener('bookpagechange',event=>{turning=false;setPages(event.detail.pages,event.detail.focus);});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&followPages)stopReading('Đã dừng đọc. Bấm Đọc trang này khi quay lại.');
  });
  window.addEventListener('pagehide',()=>stopReading());
  setPages(window.__reader.pages);
})();
