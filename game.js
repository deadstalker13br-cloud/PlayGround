(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const COLORS = ['#8bcf7a', '#76c7df', '#e88bb9', '#efbd58'];
  const KEYS = ['a', 's', 'k', 'l'];
  const BPM = 116;
  const BEAT = 60 / BPM;
  const TRAVEL = 2.15;
  const HIT_WINDOW = 0.17;
  let width = 0, height = 0, dpr = 1;
  let state = 'ready', notes = [], startAt = 0, pausedAt = 0;
  let score = 0, streak = 0, hits = 0, misses = 0, star = 0, starActive = false;
  let soundOn = true, audio = null, lastFrame = 0, feedbackTimer = 0, particles = [];
  let laneFlash = [0, 0, 0, 0];
  let best = Number(localStorage.getItem('banjoHeroBest') || 0);
  $('bestScore').textContent = String(best).padStart(6, '0');

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width; height = rect.height;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now());
  }
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(canvas);

  function makeChart() {
    notes = [];
    const patterns = [
      [0,-1,1,-1,2,-1,1,3], [0,2,-1,1,3,-1,2,1],
      [3,-1,2,1,0,-1,1,2], [1,0,-1,2,3,2,-1,1],
      [0,-1,2,3,1,-1,0,2], [3,2,-1,1,0,1,-1,3],
      [2,-1,0,1,3,-1,2,0], [1,3,2,-1,0,2,1,-1]
    ];
    for (let i = 0; i < 128; i++) {
      const p = patterns[Math.floor(i / 16) % patterns.length];
      let lane = p[i % 8];
      if (lane < 0) continue;
      if (i > 38 && i % 16 === 7) lane = (lane + 2) % 4;
      const golden = i % 16 === 0 || i % 16 === 10;
      notes.push({ time: TRAVEL + i * BEAT / 2, lane, golden, hit: false, missed: false, glow: 0 });
    }
  }

  function initAudio() {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  }
  function pluck(lane, loud = false) {
    if (!soundOn || !audio) return;
    const now = audio.currentTime;
    const frequencies = [196, 220, 261.63, 293.66];
    const osc = audio.createOscillator(), gain = audio.createGain();
    const tone = audio.createBiquadFilter();
    osc.type = 'triangle'; osc.frequency.value = frequencies[lane] * (loud ? 2 : 1);
    tone.type = 'lowpass'; tone.frequency.setValueAtTime(1900, now); tone.frequency.exponentialRampToValueAtTime(350, now + .28);
    gain.gain.setValueAtTime(loud ? .14 : .085, now); gain.gain.exponentialRampToValueAtTime(.001, now + .34);
    osc.connect(tone); tone.connect(gain); gain.connect(audio.destination); osc.start(now); osc.stop(now + .36);
  }
  function startGame() {
    initAudio(); makeChart(); score = streak = hits = misses = star = 0; starActive = false;
    particles = []; state = 'countdown'; startAt = performance.now() + 3000;
    $('gameOverlay').classList.add('hidden'); $('pauseBadge').classList.add('hidden');
    $('countdown').classList.remove('hidden'); updateHud();
  }
  function gameTime(now) { return (now - startAt) / 1000; }
  function playLane(lane) {
    if (state !== 'playing') return;
    const now = gameTime(performance.now());
    laneFlash[lane] = performance.now() + 140;
    let target = null, delta = Infinity;
    for (const n of notes) {
      if (n.lane !== lane || n.hit || n.missed) continue;
      const d = Math.abs(n.time - now);
      if (d < delta) { target = n; delta = d; }
    }
    if (target && delta <= HIT_WINDOW) {
      target.hit = true; target.glow = 1; hits++; streak++;
      const quality = delta < .055 ? 'PERFEITO!' : delta < .11 ? 'INCRÍVEL!' : 'BOA!';
      const points = Math.round((delta < .055 ? 120 : delta < .11 ? 90 : 65) * Math.min(4, 1 + Math.floor(streak / 10)) * (target.golden ? 2 : 1) * (starActive ? 2 : 1));
      score += points; star = Math.min(100, star + (target.golden ? 9 : 4));
      showFeedback(quality, target.golden);
      spawnBurst(lane, target.golden ? '#ffda70' : COLORS[lane]); pluck(lane, target.golden);
      updateHud();
    } else {
      pluck(lane); showFeedback('NO RITMO!', false, true);
    }
  }
  function showFeedback(text, gold = false, bad = false) {
    const el = $('hitFeedback'); el.textContent = text;
    el.style.color = bad ? '#d78a77' : gold ? '#ffe28b' : '#f0ce7d';
    el.classList.add('show'); clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => el.classList.remove('show'), 450);
  }
  function spawnBurst(lane, color) {
    const x = width * (.1 + lane * .2 + .1), y = height * .8;
    for (let i = 0; i < 12; i++) particles.push({x,y,vx:(Math.random()-.5)*3,vy:-Math.random()*3-1,life:1,color});
  }
  function updateHud() {
    $('score').textContent = String(score).padStart(6, '0');
    $('streak').textContent = streak;
    $('multiplier').textContent = `×${Math.min(4, 1 + Math.floor(streak / 10))}`;
    $('hits').textContent = hits; $('misses').textContent = misses;
    const tried = hits + misses;
    const accuracy = tried ? Math.round(hits / tried * 100) : null;
    $('accuracy').textContent = accuracy === null ? '—' : `${accuracy}%`;
    $('accuracyRing').style.background = `conic-gradient(var(--gold) ${accuracy || 0}%,#39372f 0)`;
    $('starPercent').textContent = `${Math.floor(star)}%`; $('starBar').style.width = `${star}%`;
    $('multiplier').classList.toggle('star-on', starActive);
  }

  function drawBackground(now) {
    ctx.clearRect(0, 0, width, height);
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#171b17'); sky.addColorStop(.55, '#171814'); sky.addColorStop(1, '#0c0e0b');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
    // Smoky stage lights and a warm moonlit horizon.
    const pulse = .75 + Math.sin(now / 780) * .12;
    [[width*.17, height*.14, '#d6a64c'],[width*.82,height*.13,'#819d72']].forEach(([x,y,c],i)=>{
      const g = ctx.createRadialGradient(x,y,2,x,y,height*.56);
      g.addColorStop(0, `${c}${Math.round(30*pulse).toString(16).padStart(2,'0')}`); g.addColorStop(1, `${c}00`);
      ctx.fillStyle = g; ctx.fillRect(0,0,width,height*.68);
      ctx.fillStyle = i ? '#c1a961' : '#f0ce7d'; ctx.globalAlpha=.72;
      ctx.beginPath(); ctx.arc(x,y,4+Math.sin(now/250+i)*1.2,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
    });
    // Far hills and the glowing festival horizon.
    ctx.fillStyle='#252b22'; ctx.beginPath(); ctx.moveTo(0,height*.44);
    for(let x=0;x<=width;x+=width/6) ctx.lineTo(x,height*(.39+Math.sin(x*.027)*.03));
    ctx.lineTo(width,height*.62);ctx.lineTo(0,height*.62);ctx.fill();
    ctx.fillStyle='#111510';ctx.beginPath();ctx.moveTo(0,height*.51);
    for(let x=0;x<=width;x+=width/7)ctx.lineTo(x,height*(.48+Math.cos(x*.023)*.04));
    ctx.lineTo(width,height);ctx.lineTo(0,height);ctx.fill();
    // Tiny lanterns around the edge of the stage.
    for(let i=0;i<18;i++){
      const x=width*(.03+i*.055); const y=height*(.45+(i%3)*.035);
      ctx.fillStyle=i%3?'#d3a94a':'#83a26c';ctx.globalAlpha=.35+Math.sin(now/500+i)*.15;
      ctx.beginPath();ctx.arc(x,y,1.3,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    }
  }

  function laneBounds(lane) { return {x:width*.1 + lane*width*.2, w:width*.2}; }
  function drawTrack(now, time) {
    const left=width*.1, right=width*.9, top=height*.12, bottom=height*.82;
    ctx.beginPath();ctx.moveTo(left+width*.065,top);ctx.lineTo(right-width*.065,top);ctx.lineTo(right,bottom);ctx.lineTo(left,bottom);ctx.closePath();
    const track=ctx.createLinearGradient(0,top,0,bottom);track.addColorStop(0,'#1b201aee');track.addColorStop(1,'#10130fef');ctx.fillStyle=track;ctx.fill();
    ctx.save();ctx.beginPath();ctx.moveTo(left+width*.065,top);ctx.lineTo(right-width*.065,top);ctx.lineTo(right,bottom);ctx.lineTo(left,bottom);ctx.closePath();ctx.clip();
    for(let i=0;i<4;i++){
      const x1=left+width*.065+i*(width*.67/4), x2=left+width*.065+(i+1)*(width*.67/4);
      if(i%2===1){ctx.fillStyle='#ffffff05';ctx.fillRect(x1,top,x2-x1,bottom-top)}
      const flash=laneFlash[i]>now;
      ctx.strokeStyle=flash?`${COLORS[i]}99`:'#ffffff17';ctx.lineWidth=flash?2:1;
      ctx.beginPath();ctx.moveTo(x1,top);ctx.lineTo(left+i*width*.2,bottom);ctx.stroke();
      if(flash){ctx.fillStyle=`${COLORS[i]}15`;ctx.fillRect(left+i*width*.2,top,width*.2,bottom-top)}
    }
    // Beat markers create a subtle sense of motion.
    for(let b=0;b<8;b++){
      const phase=((time*2+b/8)%1); const y=top+phase*(bottom-top);
      ctx.strokeStyle=`rgba(234,216,166,${.025+(b===0?.025:0)})`;ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();
    }
    ctx.restore();
    // Fret / strum line and hit pads.
    const hitY=height*.8;
    const line=ctx.createLinearGradient(left,0,right,0);line.addColorStop(0,'#f1bd4c00');line.addColorStop(.5,'#ffdb85');line.addColorStop(1,'#f1bd4c00');
    ctx.shadowColor='#f0bd51';ctx.shadowBlur=15;ctx.strokeStyle=line;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(left,hitY);ctx.lineTo(right,hitY);ctx.stroke();ctx.shadowBlur=0;
    for(let lane=0;lane<4;lane++){
      const x=width*(.1+lane*.2)+width*.1, active=laneFlash[lane]>now;
      ctx.beginPath();ctx.ellipse(x,hitY,width*.055,8,0,0,Math.PI*2);
      ctx.fillStyle=active?`${COLORS[lane]}66`:'#141611';ctx.fill();ctx.strokeStyle=active?COLORS[lane]:`${COLORS[lane]}88`;ctx.lineWidth=active?2:1;ctx.stroke();
      ctx.fillStyle=COLORS[lane];ctx.globalAlpha=active?.95:.65;ctx.beginPath();ctx.arc(x,hitY,3,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    }
    // Draw notes at a constant travel speed toward the hit line.
    for(const n of notes){
      if(n.hit||n.missed)continue;
      const remaining=n.time-time;if(remaining>TRAVEL||remaining<-.25)continue;
      const y=height*.12+(TRAVEL-remaining)/TRAVEL*(height*.68);
      const x=width*(.1+n.lane*.2)+width*.1, r=Math.min(17,width*.036);
      const color=n.golden?'#f4cb69':COLORS[n.lane];
      ctx.save();ctx.shadowColor=color;ctx.shadowBlur=n.golden?22:14;
      ctx.fillStyle='#10120f';ctx.strokeStyle=color;ctx.lineWidth=n.golden?3:2;
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.shadowBlur=0;ctx.globalAlpha=.85;ctx.strokeStyle=color;ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(x,y,r*.58,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();
      if(n.golden){ctx.fillStyle='#fff0bb';ctx.font=`${Math.max(8,r*.8)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('✦',x,y-r-8)}
      ctx.restore();
    }
    // Burst particles.
    particles=particles.filter(p=>p.life>0);
    for(const p of particles){p.x+=p.vx;p.y+=p.vy;p.vy+=.035;p.life-=.025;ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,2.2*p.life,0,Math.PI*2);ctx.fill()}
    ctx.globalAlpha=1;
  }

  function finishGame() {
    state='finished';
    if(score>best){best=score;localStorage.setItem('banjoHeroBest',best)}
    $('bestScore').textContent=String(best).padStart(6,'0');
    const accuracy=hits+misses?Math.round(hits/(hits+misses)*100):0;
    $('overlayContent').innerHTML=`<div class="banjo-emblem">✦</div><p class="overlay-eyebrow">APRESENTAÇÃO ENCERRADA</p><h2>${accuracy>=90?'A casa veio abaixo!':accuracy>=65?'Mandou muito bem!':'O palco é seu!'}</h2><p class="overlay-copy">${score.toLocaleString('pt-BR')} pontos · ${accuracy}% de precisão<br>${hits} notas certas · ${streak} na sequência máxima</p><button class="play-button" id="playButton"><span>↻</span> TOCAR DE NOVO</button><div class="key-guide"><span class="keycap">R</span><small>RECOMEÇAR A MÚSICA</small></div>`;
    $('playButton').addEventListener('click',startGame);
    $('gameOverlay').classList.remove('hidden');
    updateHud();
  }

  function frame(now) {
    if(!width||!height){requestAnimationFrame(frame);return}
    if(state==='countdown'){
      const left=(startAt-now)/1000;
      if(left<=0){state='playing';$('countdown').classList.add('hidden');showFeedback('VAI!',true)}
      else $('countdown').textContent=String(Math.ceil(left));
    }
    let time=state==='playing'||state==='finished' ? gameTime(now) : state==='paused' ? gameTime(pausedAt) : 0;
    if(state==='playing'){
      for(const n of notes){
        if(!n.hit&&!n.missed&&time>n.time+HIT_WINDOW){n.missed=true;misses++;streak=0;star=Math.max(0,star-2);updateHud()}
      }
      const duration=notes.length?notes[notes.length-1].time+1.4:0;
      const progress=Math.min(100,Math.max(0,time/duration*100));
      $('progressBar').style.width=`${progress}%`; $('progressText').textContent=`${Math.floor(progress)}%`;
      if(starActive){star=Math.max(0,star-.12);if(star<=0)starActive=false;updateHud()}
      if(time>duration)finishGame();
    }
    draw(now,time);
    lastFrame=now;requestAnimationFrame(frame);
  }
  function draw(now,time=0){drawBackground(now);if(width&&height)drawTrack(now,time)}

  function togglePause(){
    if(state==='playing'){state='paused';pausedAt=performance.now();$('pauseBadge').classList.remove('hidden')}
    else if(state==='paused'){startAt+=performance.now()-pausedAt;state='playing';$('pauseBadge').classList.add('hidden')}
  }
  function activateStar(){if(state==='playing'&&star>=100&&!starActive){star=100;starActive=true;showFeedback('BRILHO!',true);updateHud()}}
  function keydown(event){
    const key=event.key.toLowerCase();
    if([' ','arrowleft','arrowright','arrowup','arrowdown'].includes(key))event.preventDefault();
    if(key==='escape'||key==='p'){togglePause();return}
    if(key==='r'){startGame();return}
    if(key===' '){activateStar();return}
    const lane=KEYS.indexOf(key);if(lane>=0&&!event.repeat)playLane(lane);
  }
  window.addEventListener('keydown',keydown);
  $('playButton').addEventListener('click',startGame);
  $('resumeButton').addEventListener('click',togglePause);
  $('soundToggle').addEventListener('click',()=>{
    soundOn=!soundOn;$('soundLabel').textContent=soundOn?'SOM LIGADO':'SOM DESLIGADO';
    $('soundToggle').setAttribute('aria-label',soundOn?'Desativar som':'Ativar som');
    if(soundOn)initAudio();
  });
  $('touchControls').querySelectorAll('[data-lane]').forEach(button=>{
    button.addEventListener('pointerdown',event=>{event.preventDefault();const lane=Number(button.dataset.lane);playLane(lane);button.classList.add('active');setTimeout(()=>button.classList.remove('active'),120)});
  });
  updateHud();resize();requestAnimationFrame(frame);
})();
