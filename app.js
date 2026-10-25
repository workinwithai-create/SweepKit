// SweepKit — WorkinWithAI. "How do you come up with 40 different drum transitions for one song?"
// Pack risers, swells and impacts are printed at someone else's tempo and key; stretch them and they smear, leave them and they
// land off the downbeat. SweepKit synthesizes the transition at YOUR BPM and key: riser, reverse swell, downlifter, sub impact,
// snare build, tom roll, stop-time, drop-out, half-time, written into the end of your section so it lands exactly on 1.
// Audition it in context (your 4 chords), step through seeded variations, export the section or the transition alone + MIDI.
// Every voice is a synthesizer and is named as one (no samples, nothing downloaded, nothing uploaded).
const APP = "sweepkit";
const SR = 48000, LOOKAHEAD_MS = 25, SCHEDULE_AHEAD = 0.12, STEPS = 16, TAIL_S = 2.5;
const NAMES = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];
const CHAIRS = [
  { id:"kick",  name:"Synth kick",  ch:9 }, { id:"snare", name:"Synth snare (noise + tone)", ch:9 },
  { id:"hat",   name:"Synth hat (filtered noise)", ch:9 }, { id:"toms", name:"Synth toms", ch:9 },
  { id:"crash", name:"Noise crash", ch:9 }, { id:"bass", name:"Saw bass", ch:0 },
  { id:"chords",name:"Saw pad (chords)", ch:1 }, { id:"fx", name:"Noise+saw riser / swell / downlifter, sine sub impact", ch:2 },
];
const DRUMNOTE = { kick:36, snare:38, hat:42, crash:49 };
const TOMS = [50,48,47,45,43,41]; const TOMF = {50:210,48:180,47:155,45:130,43:108,41:88};
const FILLS = [
  { id:"riser", name:"Riser",         blurb:"Noise sweep + saw climbing 3 octaves from your key's root; hats go 16ths." },
  { id:"swell", name:"Reverse swell", blurb:"Groove cuts for the last beat, a reversed-cymbal swell sucks into 1." },
  { id:"down",  name:"Downlifter",    blurb:"Kick drops for the fill; on 1 a sub impact and a falling sweep in your key." },
  { id:"toms",  name:"Tom roll",      blurb:"Groove drops, toms run high to low, crash on 1." },
  { id:"snare", name:"Snare build",   blurb:"8ths, then 16ths, then 32nds, getting louder." },
  { id:"stop",  name:"Stop-time",     blurb:"Band hits once and stops; a few unison hits, then air." },
  { id:"drop",  name:"Drop-out",      blurb:"Kick, snare and bass vanish; hats and pad hang; sub impact in your key on 1." },
  { id:"half",  name:"Half-time",     blurb:"The groove halves for the fill, then a flam into 1." },
  { id:"none",  name:"No fill",       blurb:"The plain loop, for A/B against a fill." },
];
const STYLES = [
  { id:"backbeat", name:"Backbeat", blurb:"Kick 1 & 3-and, snare 2 & 4, 8th hats" },
  { id:"four",     name:"Four on the floor", blurb:"Kick every beat, offbeat hats" },
  { id:"trap",     name:"Half-time trap", blurb:"Snare on 3, 16th hats" },
];
const PRESETS = [ { name:"Late Night", bpm:92, keyRoot:9, chords:"Am F C G", style:"trap" },
  { name:"Slow Ballad", bpm:68, keyRoot:0, chords:"C Am F G", style:"backbeat" },
  { name:"Club", bpm:124, keyRoot:4, chords:"Em C G D", style:"four" } ];
const QUAL = {"":[0,4,7], m:[0,3,7], min:[0,3,7], "7":[0,4,7,10], m7:[0,3,7,10], maj7:[0,4,7,11], dim:[0,3,6], sus2:[0,2,7], sus4:[0,5,7]};
const ROOT = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const pc = x => ((x%12)+12)%12;
const inRange = (n,lo,hi) => { while(n<lo) n+=12; while(n>hi) n-=12; return n; };
const DEFAULT = { bpm:92, keyRoot:9, chords:"Am F C G", style:"trap", bars:8, fill:"riser", fillLen:16, intensity:2, variation:1, crash:true,
  mutes:{kick:false,snare:false,hat:false,toms:false,crash:false,bass:false,chords:false,fx:false},
  gains:{kick:0.9,snare:0.7,hat:0.35,toms:0.75,crash:0.35,bass:0.6,chords:0.32,fx:0.5},
  master:0.9, liveGain:0.9, audioOut:"", audioIn:"", monitor:false, midiIn:"", midiOut:"", padOct:4 };
const state = Object.assign({}, DEFAULT, JSON.parse(localStorage.getItem(APP+"-settings")||"{}"));
state.mutes = Object.assign({}, DEFAULT.mutes, state.mutes); state.gains = Object.assign({}, DEFAULT.gains, state.gains);
if(!FILLS.some(f=>f.id===state.fill)) state.fill="riser"; if(!STYLES.some(s=>s.id===state.style)) state.style="trap";
const save = () => localStorage.setItem(APP+"-settings", JSON.stringify(state));
function parseChord(s){ const m=/^([A-G])(#|b)?(maj7|min|m7|m|7|dim|sus2|sus4)?$/.exec(s.trim()); if(!m) return null;
  return { root:pc(ROOT[m[1]]+(m[2]==="#"?1:m[2]==="b"?-1:0)), ivs:QUAL[m[3]||""], q:m[3]||"", minor:/^m(?!aj)|^min|^dim/.test(m[3]||"") }; }
function parseProg(str){ const t=String(str).trim().split(/[\s,|]+/).filter(Boolean); if(t.length!==4) return null; const c=t.map(parseChord); return c.includes(null)?null:c; }
const progOf = st => parseProg(st.chords) || parseProg(DEFAULT.chords);
const keyLabel = st => NAMES[st.keyRoot].replace("#","s") + (progOf(st)[0].minor?"m":"");
function chordAt(bar, st){ const pr=progOf(st), c=pr[bar%4], r=pc(c.root+st.keyRoot-pr[0].root); return { root:r, ivs:c.ivs, name:NAMES[r]+c.q }; }
// deterministic PRNG seeded by variation + fill + step: the same settings always give the same fill, live and in every export
function rng(seed){ let a=seed>>>0; return ()=>{ a=(a+0x6D2B79F5)>>>0; let t=a; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; }
const hash = (...xs) => xs.reduce((h,x)=>Math.imul(h^(typeof x==="string"?[...x].reduce((a,c)=>a*31+c.charCodeAt(0)|0,7):x),2654435761)>>>0, 2166136261);

// ---------- the arrangement: ONE function feeds live playback, WAV and MIDI ----------
function grooveEvents(b, st, style){ const e=[]; // b = step within bar
  if(style==="backbeat"){ if(b===0||b===10) e.push(["kick",36,b?0.8:1]); if(b===4||b===12) e.push(["snare",38,0.9]); if(b%2===0) e.push(["hat",42,b%4?0.45:0.7]); }
  else if(style==="four"){ if(b%4===0) e.push(["kick",36,1]); if(b===4||b===12) e.push(["snare",38,0.85]); if(b%4===2) e.push(["hat",42,0.75]); else if(b%2===0) e.push(["hat",42,0.3]); }
  else { if(b===0||b===11) e.push(["kick",36,b?0.85:1]); if(b===8) e.push(["snare",38,1]); e.push(["hat",42,b%4===0?0.7:b%2?0.3:0.45]); }
  return e.map(([part,note,vel])=>({part,note,vel,dur:1,off:0})); }
function stepEvents(s, st){
  const N=st.bars*STEPS, F=Math.min(st.fillLen, N), fs=N-F, inFill=st.fill!=="none" && s>=fs, k=s-fs, bar=Math.floor(s/STEPS), b=s%STEPS, I=st.intensity;
  const R=rng(hash(st.variation, st.fill, s, I)), ev=[], add=(part,note,vel,dur=1,off=0,extra)=>ev.push(Object.assign({part,note,vel,dur,off},extra||{}));
  const ch=chordAt(bar,st), bassN=inRange(36+ch.root,33,47), padNotes=ch.ivs.map(iv=>inRange(60+pc(ch.root+iv),55,71)).sort((a,b)=>a-b);
  const fill=inFill?st.fill:null, cutsPad = fill==="stop"||fill==="swell"&&k>=F-4;
  // drums
  let groove = !fill || fill==="riser" || fill==="down" || (fill==="swell" && k<F-4);
  if(groove){ let g=grooveEvents(b,st,st.style); if(fill==="down") g=g.filter(x=>x.part!=="kick"); if(fill==="riser") g=g.filter(x=>x.part!=="hat").concat([{part:"hat",note:42,vel:0.35+0.5*k/F,dur:1,off:0}]); ev.push(...g); }
  if(fill==="half"){ if(k%8===0) add("kick",36,1); if(k%16===8||k%8===4&&F<8) add("snare",38,1); if(k%2===0) add("hat",42,0.4);
    if(k===F-1){ add("snare",38,0.6,1,0); add("snare",38,1,1,0.5); } }
  if(fill==="snare"){ if(b%4===0) add("kick",36,0.9); const v=0.3+0.7*(k+1)/F, q=F/4; // first half 8ths, third quarter 16ths, last quarter 32nds (intensity 3) / 16ths
    if(k<F/2){ if(k%2===0) add("snare",38,v); } else if(k<F-q || I<3){ add("snare",38,v); } else { add("snare",38,v); add("snare",38,Math.min(1,v+0.05),1,0.5); }
    if(I>=2) add("hat",42,0.3); }
  if(fill==="toms"){ const pool=I===1?TOMS.slice(1,5):TOMS, hit=I===1?k%2===0:true;
    if(hit){ const idx=Math.min(pool.length-1,Math.floor(k/F*pool.length)), sub=R()<0.12*I&&k<F-2; add(sub?"snare":"toms",sub?38:pool[idx],0.55+0.45*(k+1)/F); if(k%4===0) add("kick",36,0.8); }
    if(I===3&&k>=F-2) add("toms",TOMS[TOMS.length-1],1,1,0.5); }
  if(fill==="stop"){ const hits=[0]; for(let j=2;j<F-1;j+=2) if(R()<0.18+0.1*I) hits.push(j); if(hits.includes(k)){ add("kick",36,1); add("snare",38,k?0.8:0.9); if(k===0) add("crash",49,0.6); } }
  if(fill==="drop"){ add("hat",42,b%2?0.3:0.55); if(I>=3&&k>=F-4) add("snare",38,0.4+0.15*(k-F+4)); }
  if(fill==="swell" && k>=F-4 && I>=2 && k===F-1) add("kick",36,0.5,1,0.5);
  // section downbeat: crash (+ sub impact for drop / swell / riser) after any fill
  if(s===0 && st.fill!=="none" && st.crash){ add("crash",49,0.8); if(["drop","swell","riser","down"].includes(st.fill)) add("fx",24+st.keyRoot,0.9,8,0,{fx:"impact"}); if(st.fill==="down") add("fx",48+st.keyRoot,0.4+0.2*I,Math.min(st.fillLen,N),0,{fx:"downlifter"}); }
  // fx layer
  if(k===0 && fill){ if(fill==="riser"||fill==="snare"&&I>=2) add("fx",36+st.keyRoot,0.4+0.2*I,F,0,{fx:"riser"});
    if(fill==="swell"){ const L=Math.min(F,8); ev.push({part:"fx",note:61,vel:0.5+0.2*I,dur:L,off:F-L,fx:"swell"}); } }
  // bass + pad
  const bassOut = fill && ["toms","stop","drop","swell"].includes(fill) && !(fill==="toms"&&k<F/2);
  if(!bassOut && !(fill==="swell"&&k>=F-4)){ const pat = st.style==="four" ? [2,6,10,14] : st.style==="trap" ? [0,11] : [0,6,10]; if(pat.includes(b)) add("bass",bassN,0.85,st.style==="trap"&&b===0?6:2); }
  if(fill==="stop" && k===0) for(const n of padNotes) add("chords",n,0.9,2);
  else if(b===0 && !(fill==="stop")){ let dur=STEPS; if(st.fill==="stop"||st.fill==="swell"){ const cut=st.fill==="stop"?fs:N-4; if(s<cut && s+dur>cut) dur=cut-s; }
    if(!cutsPad) for(const n of padNotes) add("chords",n,0.75,dur); }
  return ev; }

// ---------- synth voices (deterministic: noise is a seeded buffer) ----------
const noiseCache = new WeakMap();
function noise(c){ let b=noiseCache.get(c); if(b) return b; const n=Math.round(2*c.sampleRate); b=c.createBuffer(1,n,c.sampleRate); const d=b.getChannelData(0), r=rng(12345); for(let i=0;i<n;i++) d[i]=r()*2-1; noiseCache.set(c,b); return b; }
let active = new Set();
function track(src, live){ if(!live) return; active.add(src); src.onended=()=>active.delete(src); }
function env(c, dest, t, peak, attack, hold, release){ const g=c.createGain(); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(peak,t+attack); g.gain.setValueAtTime(peak,t+attack+Math.max(0,hold)); g.gain.linearRampToValueAtTime(0,t+attack+Math.max(0,hold)+release); g.connect(dest); return g; }
function decayEnv(c, dest, t, peak, dec){ const g=c.createGain(); g.gain.setValueAtTime(peak,t); g.gain.exponentialRampToValueAtTime(0.0008,t+dec); g.gain.linearRampToValueAtTime(0,t+dec+0.01); g.connect(dest); return g; }
function noiseSrc(c, t, dur, live){ const s=c.createBufferSource(); s.buffer=noise(c); s.loop=true; s.start(t, 0); s.stop(t+dur+0.02); track(s,live); return s; }
function osc(c, type, f, t, dur, live){ const o=c.createOscillator(); o.type=type; o.frequency.value=f; o.frequency.setValueAtTime(f,t); /* default = f too: if start() lands a frame before the event it must not play 440 Hz */ o.start(t); o.stop(t+dur+0.02); track(o,live); return o; }
function voice(c, dest, ev, t0, sd, live){
  const t = live ? t0+ev.off*sd : Math.round((t0+ev.off*sd)*c.sampleRate)/c.sampleRate, v=ev.vel, len=ev.dur*sd; // offline: every hit lands on an exact sample
  switch(ev.part){
    case "kick": { const g=decayEnv(c,dest,t,1.1*v,0.42), o=osc(c,"sine",150,t,0.45,live); o.frequency.exponentialRampToValueAtTime(42,t+0.13); o.connect(g); break; }
    case "snare": { const g=decayEnv(c,dest,t,0.9*v,0.2), f=c.createBiquadFilter(); f.type="bandpass"; f.frequency.value=1900; f.Q.value=0.7; noiseSrc(c,t,0.22,live).connect(f); f.connect(g);
      const g2=decayEnv(c,dest,t,0.55*v,0.09), o=osc(c,"triangle",190,t,0.1,live); o.frequency.exponentialRampToValueAtTime(150,t+0.08); o.connect(g2); break; }
    case "hat": { const g=decayEnv(c,dest,t,0.6*v,0.055), f=c.createBiquadFilter(); f.type="highpass"; f.frequency.value=7200; noiseSrc(c,t,0.07,live).connect(f); f.connect(g); break; }
    case "toms": { const f0=TOMF[ev.note]||130, g=decayEnv(c,dest,t,1.0*v,0.38), o=osc(c,"sine",f0,t,0.4,live); o.frequency.exponentialRampToValueAtTime(f0*0.72,t+0.25); o.connect(g);
      const g2=decayEnv(c,dest,t,0.2*v,0.03), n=c.createBiquadFilter(); n.type="bandpass"; n.frequency.value=f0*4; noiseSrc(c,t,0.04,live).connect(n); n.connect(g2); break; }
    case "crash": { const g=decayEnv(c,dest,t,0.7*v,1.8), f=c.createBiquadFilter(); f.type="highpass"; f.frequency.value=4200; const p=c.createBiquadFilter(); p.type="peaking"; p.frequency.value=6500; p.gain.value=6;
      noiseSrc(c,t,1.85,live).connect(f); f.connect(p); p.connect(g); break; }
    case "bass": { const hz=440*Math.pow(2,(ev.note-69)/12), g=env(c,dest,t,0.55*v,0.005,Math.max(0.01,len-0.045),0.04), f=c.createBiquadFilter(); f.type="lowpass"; f.frequency.value=650; f.Q.value=3;
      osc(c,"sawtooth",hz,t,len,live).connect(f); f.connect(g); const s=osc(c,"sine",hz,t,len,live), g2=env(c,dest,t,0.45*v,0.005,Math.max(0.01,len-0.045),0.04); s.connect(g2); break; }
    case "chords": padVoice(c,dest,ev.note,v,t,len,live); break;
    case "fx": {
      if(ev.fx==="riser"){ const g=c.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(0.5*v,t+len-0.01); g.gain.linearRampToValueAtTime(0,t+len); g.connect(dest);
        const f=c.createBiquadFilter(); f.type="bandpass"; f.Q.value=3; f.frequency.setValueAtTime(300,t); f.frequency.exponentialRampToValueAtTime(9000,t+len); noiseSrc(c,t,len,live).connect(f); f.connect(g);
        const r0=440*Math.pow(2,(ev.note-69)/12), o=osc(c,"sawtooth",r0,t,len,live); o.frequency.exponentialRampToValueAtTime(r0*8,t+len); const lp=c.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=2500; const g2=c.createGain(); g2.gain.value=0.25; o.connect(lp); lp.connect(g2); g2.connect(g); }
      else if(ev.fx==="swell"){ const g=c.createGain(); g.gain.setValueAtTime(0.0005,t); g.gain.exponentialRampToValueAtTime(0.75*v,t+len); g.gain.linearRampToValueAtTime(0,t+len+0.008); g.connect(dest);
        const f=c.createBiquadFilter(); f.type="highpass"; f.frequency.value=3000; noiseSrc(c,t,len+0.01,live).connect(f); f.connect(g); }
      else if(ev.fx==="downlifter"){ const hz=440*Math.pow(2,(ev.note-69)/12), g=c.createGain(); g.gain.setValueAtTime(0.6*v,t); g.gain.exponentialRampToValueAtTime(0.002,t+len); g.gain.linearRampToValueAtTime(0,t+len+0.01); g.connect(dest);
        const f=c.createBiquadFilter(); f.type="bandpass"; f.Q.value=2.5; f.frequency.setValueAtTime(8000,t); f.frequency.exponentialRampToValueAtTime(250,t+len); noiseSrc(c,t,len,live).connect(f); f.connect(g);
        const o=osc(c,"sawtooth",hz*2,t,len,live); o.frequency.exponentialRampToValueAtTime(hz/4,t+len); const lp=c.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=2000; const g2=c.createGain(); g2.gain.value=0.25; o.connect(lp); lp.connect(g2); g2.connect(g); }
      else { const root=440*Math.pow(2,(ev.note-69)/12), g=decayEnv(c,dest,t,1.0*v,1.1), o=osc(c,"sine",root*2.5,t,1.15,live); o.frequency.exponentialRampToValueAtTime(root,t+0.5); o.connect(g); } /* sub impact: lands on your key's root (MIDI 24+key) */
      break; }
  } }
function padVoice(c, dest, note, v, t, len, live){ // held for its full length: attack ramp (swell), sustain, 0.25 s release
  const hz=440*Math.pow(2,(note-69)/12), g=env(c,dest,t,0.22*v,0.06,Math.max(0,len-0.06),0.25), f=c.createBiquadFilter(); f.type="lowpass"; f.frequency.value=1800; f.Q.value=0.5; f.connect(g);
  const os=[-7,7].map(dc=>{ const o=osc(c,"sawtooth",hz,t,len+0.3,live); o.detune.value=dc; o.connect(f); return o; }); return {g,os}; }

// ---------- live engine ----------
let ctx=null, bus=null, playing=false, timerId=null, nextStepTime=0, step=0; const stepLog=[]; window.__schedLog=[];
function makeComp(c){ const k=c.createDynamicsCompressor(); k.threshold.value=-10; k.knee.value=4; k.ratio.value=12; k.attack.value=0.003; k.release.value=0.12; return k; }
function buildBus(c){ const comp=makeComp(c), master=c.createGain(), live=c.createGain(), chairs={};
  master.gain.value=state.master; live.gain.value=state.liveGain; for(const ch of CHAIRS){ const g=c.createGain(); g.gain.value=state.gains[ch.id]; g.connect(master); chairs[ch.id]=g; }
  live.connect(master); master.connect(comp); comp.connect(c.destination); return {comp,master,live,chairs}; }
async function ensureCtx(){ if(!ctx){ ctx=new (window.AudioContext||window.webkitAudioContext)(); bus=buildBus(ctx); applySink(); } await ctx.resume(); }
function start(){ if(!ctx||ctx.state!=="running") return; stop(true); nextStepTime=ctx.currentTime+0.1; step=0; stepLog.length=0; playing=true;
  timerId=setInterval(scheduler, LOOKAHEAD_MS); scheduler(); requestAnimationFrame(draw); paintTransport(); setStatus("Playing your section: the fill is the shaded part. Change anything; it lands on the next step."); }
function scheduler(){ while(nextStepTime < ctx.currentTime+SCHEDULE_AHEAD){ scheduleStep(step, nextStepTime); nextStepTime += 60/state.bpm/4; step=(step+1)%(state.bars*STEPS); } }
function scheduleStep(s, time){ const sd=60/state.bpm/4, evs=stepEvents(s, state);
  for(const ev of evs){ if(state.mutes[ev.part]) continue; voice(ctx, bus.chairs[ev.part], ev, time, sd, true); midiSend(ev, time, sd); }
  stepLog.push({s, time}); if(stepLog.length>512) stepLog.shift();
  window.__schedLog.push({step:s, time, bpm:state.bpm, fill:state.fill, style:state.style, keyRoot:state.keyRoot, mutes:Object.assign({},state.mutes), notes:evs.filter(e=>!state.mutes[e.part]).map(e=>e.part+":"+e.note)});
  if(window.__schedLog.length>4000) window.__schedLog.shift(); }
function stop(quiet){ clearInterval(timerId); timerId=null; const was=playing; playing=false;
  for(const s of active){ try{ s.stop(); }catch(e){} } active.clear();
  if(midiOut) for(const c of [0,1,2,9]) midiOut.send([0xB0|c,123,0]);
  paintTransport(); if(was&&!quiet) setStatus("Stopped."); }
function draw(){ if(!playing) return; const now=ctx.currentTime; let cur=null; for(const e of stepLog){ if(e.time<=now) cur=e; else break; }
  if(cur){ const N=state.bars*STEPS, frac=Math.min(1,(now-cur.time)/(60/state.bpm/4)); ui.ph.style.left=((cur.s+frac)/N*100)+"%"; ui.ph.hidden=false; }
  requestAnimationFrame(draw); }
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="hidden"){ if(playing){ stop(true); setStatus("Stopped because the tab was hidden. Press Play to start again."); } liveAllOff(); } });

// ---------- export (OfflineAudioContext, 48 kHz, exact grid, tail folded, no compressor, peak normalised to -1 dBFS) ----------
function merged(o){ const st=Object.assign({},state,o||{}); st.mutes=Object.assign({},state.mutes,(o||{}).mutes); st.gains=Object.assign({},state.gains,(o||{}).gains); return st; }
async function renderLoop(o){ const st=merged(o), loops=st.loops||1, N=loops*Math.round(st.bars*4*60/st.bpm*SR), T=Math.round(TAIL_S*SR), oc=new OfflineAudioContext(2,N+T,SR), sd=60/st.bpm/4, secS=Math.round(st.bars*4*60/st.bpm*SR)/SR; // loops>1 is QA only: the section played back to back
  const master=oc.createGain(); master.connect(oc.destination); const chairs={}; for(const c of CHAIRS){ const g=oc.createGain(); g.gain.value=st.gains[c.id]; g.connect(master); chairs[c.id]=g; }
  for(let l=0;l<loops;l++) for(let s=0;s<st.bars*STEPS;s++) for(const ev of stepEvents(s,st)) if(!st.mutes[ev.part]) voice(oc, chairs[ev.part], ev, l*secS+s*sd, sd, false);
  const buf=await oc.startRendering(), ch=[0,1].map(i=>{ const src=buf.getChannelData(i), x=src.slice(0,N); for(let j=0;j<T&&j<N;j++) x[j]+=src[N+j]; return x; });
  let pk=0; for(const x of ch) for(let i=0;i<N;i++){ const a=Math.abs(x[i]); if(a>pk) pk=a; }
  const target=Math.pow(10,-1.05/20), g=pk>0?target/pk:1; if(!st.noNorm) for(const x of ch) for(let i=0;i<N;i++) x[i]*=g;
  return {ch,N,st,gain:g}; }
function wav24(ch,N){ const nc=2,len=N*nc*3,b=new ArrayBuffer(44+len),v=new DataView(b); let p=0;
  const str=s=>{for(const c of s) v.setUint8(p++,c.charCodeAt(0));}, u32=x=>{v.setUint32(p,x,true);p+=4}, u16=x=>{v.setUint16(p,x,true);p+=2};
  str("RIFF");u32(36+len);str("WAVE");str("fmt ");u32(16);u16(1);u16(nc);u32(SR);u32(SR*nc*3);u16(nc*3);u16(24);str("data");u32(len);
  for(let i=0;i<N;i++) for(let c=0;c<nc;c++){ let x=Math.round(Math.max(-1,Math.min(1,ch[c][i]))*8388607); if(x<0)x+=16777216; v.setUint8(p++,x&255);v.setUint8(p++,(x>>8)&255);v.setUint8(p++,(x>>16)&255); }
  return new Uint8Array(b); }
function midiFile(st){
  const PPQ=480,T=PPQ/4,total=st.bars*STEPS*T, vlq=n=>{const a=[n&127]; while(n>>=7) a.unshift((n&127)|128); return a;};
  const trk=evs=>{ evs.sort((a,b)=>a.t-b.t||a.o-b.o); let last=0; const d=[]; for(const e of evs){ d.push(...vlq(e.t-last),...e.b); last=e.t; }
    d.push(...vlq(Math.max(0,total-last)),0xFF,0x2F,0); return [0x4D,0x54,0x72,0x6B,(d.length>>>24)&255,(d.length>>16)&255,(d.length>>8)&255,d.length&255,...d]; };
  const meta=(type,s)=>{ const c=[...new TextEncoder().encode(s)]; return [0xFF,type,...vlq(c.length),...c]; }, us=Math.round(60000000/st.bpm), F=Math.min(st.fillLen,st.bars*STEPS);
  const fillName=FILLS.find(f=>f.id===st.fill).name, cond=[{t:0,o:0,b:meta(0x03,`SweepKit ${st.bpm} BPM ${keyLabel(st)} - ${fillName}`)},{t:0,o:1,b:[0xFF,0x51,3,(us>>16)&255,(us>>8)&255,us&255]},{t:0,o:2,b:[0xFF,0x58,4,4,2,24,8]}];
  for(let b=0;b<st.bars;b++) cond.push({t:b*STEPS*T,o:3,b:meta(0x06,chordAt(b,st).name)}); if(st.fill!=="none") cond.push({t:(st.bars*STEPS-F)*T,o:4,b:meta(0x06,"Fill: "+fillName)});
  const tracks=[trk(cond)], groups=[["Drums (GM, ch 10)",["kick","snare","hat","toms","crash"],9],["Bass",["bass"],0],["Chords (pad)",["chords"],1],["FX cues (riser = key root C2-B2, downlifter C3-B3, impact C1-B1, swell C#4)",["fx"],2]];
  for(const [nm,parts,ch] of groups){ const evs=[{t:0,o:0,b:meta(0x03,nm)}];
    for(let s=0;s<st.bars*STEPS;s++) for(const ev of stepEvents(s,st)){ if(!parts.includes(ev.part)||st.mutes[ev.part]) continue;
      const t0=Math.round((s+ev.off)*T), t1=Math.min(total, Math.round((s+ev.off+(ch===9?0.5:ev.dur))*T)), v=Math.max(1,Math.min(127,Math.round(ev.vel*110)));
      evs.push({t:t0,o:2,b:[0x90|ch,ev.note,v]}); evs.push({t:Math.max(t0+1,t1),o:1,b:[0x80|ch,ev.note,0]}); }
    tracks.push(trk(evs)); }
  return new Uint8Array([].concat([0x4D,0x54,0x68,0x64,0,0,0,6,0,1,0,tracks.length,PPQ>>8,PPQ&255],...tracks)); }
const fileBase = st => `${APP}-${st.fill}-${st.bpm}bpm-${keyLabel(st)}`;
async function exportWavBytes(o){ const r=await renderLoop(o); return {bytes:wav24(r.ch,r.N), name:fileBase(r.st)+".wav", frames:r.N}; }
function exportMidBytes(o){ const st=merged(o); return {bytes:midiFile(st), name:fileBase(st)+".mid"}; }
function crc32(b){ let c,crc=-1; for(let i=0;i<b.length;i++){ c=(crc^b[i])&255; for(let k=0;k<8;k++) c=c&1?(c>>>1)^0xEDB88320:c>>>1; crc=(crc>>>8)^c; } return (crc^-1)>>>0; }
function zipStore(fl){ const parts=[], cen=[]; let off=0; const enc=new TextEncoder(); const le=(n,w)=>{ const a=[]; for(let i=0;i<w;i++) a.push((n>>>(8*i))&255); return a; };
  for(const f of fl){ const nm=enc.encode(f.name), c=crc32(f.bytes), sz=f.bytes.length;
    const h=new Uint8Array([0x50,0x4B,3,4,20,0,0,0,0,0,0,0,0x21,0,...le(c,4),...le(sz,4),...le(sz,4),...le(nm.length,2),0,0,...nm]);
    parts.push(h,f.bytes); cen.push(new Uint8Array([0x50,0x4B,1,2,20,0,20,0,0,0,0,0,0,0,0x21,0,...le(c,4),...le(sz,4),...le(sz,4),...le(nm.length,2),0,0,0,0,0,0,0,0,0,0,0,0,...le(off,4),...nm])); off+=h.length+sz; }
  const cl=cen.reduce((a,x)=>a+x.length,0), end=new Uint8Array([0x50,0x4B,5,6,0,0,0,0,...le(fl.length,2),...le(fl.length,2),...le(cl,4),...le(off,4),0,0]);
  const out=new Uint8Array(off+cl+end.length); let p=0; for(const x of [...parts,...cen,end]){ out.set(x,p); p+=x.length; } return out; }
async function exportPackBytes(o){ const fl=[]; for(const f of FILLS.filter(f=>f.id!=="none")){ const w=await exportWavBytes(Object.assign({},o,{fill:f.id})), m=exportMidBytes(Object.assign({},o,{fill:f.id})); fl.push({name:w.name,bytes:w.bytes},{name:m.name,bytes:m.bytes}); }
  const st=merged(o); return {zip:zipStore(fl), name:`${APP}-pack-${st.bpm}bpm-${keyLabel(st)}-v${st.variation}.zip`, files:fl}; }
async function exportFillStemBytes(o){ // the transition alone (drums + fx of the fill bar(s) and the crash/impact on 1), on the same grid: drop it over your own loop
  const st=merged(o), N=st.bars*STEPS, fs=N-Math.min(st.fillLen,N), sd=60/st.bpm/4, n=Math.round(st.bars*4*60/st.bpm*SR), T=Math.round(TAIL_S*SR), oc=new OfflineAudioContext(2,n+T,SR), master=oc.createGain(); master.connect(oc.destination);
  const chairs={}; for(const c of CHAIRS){ const g=oc.createGain(); g.gain.value=st.gains[c.id]; g.connect(master); chairs[c.id]=g; }
  for(let s=0;s<N;s++) for(const ev of stepEvents(s,st)){ if(st.mutes[ev.part]||ev.part==="bass"||ev.part==="chords") continue; if(s<fs && !(s===0 && (ev.part==="crash"||ev.fx==="impact"))) continue; voice(oc,chairs[ev.part],ev,s*sd,sd,false); }
  const buf=await oc.startRendering(), ch=[0,1].map(i=>{ const src=buf.getChannelData(i), x=src.slice(0,n); for(let j=0;j<T&&j<n;j++) x[j]+=src[n+j]; return x; });
  let pk=0; for(const x of ch) for(let i=0;i<n;i++) pk=Math.max(pk,Math.abs(x[i])); const g=pk>0?Math.pow(10,-1.05/20)/pk:1; for(const x of ch) for(let i=0;i<n;i++) x[i]*=g;
  return {bytes:wav24(ch,n), name:fileBase(st)+"-transition-only.wav", frames:n}; }
function download(bytes,name,type){ const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([bytes],{type})); a.download=name; document.body.appendChild(a); a.click(); a.remove(); }

// ---------- Lemon Squeezy license gate (empty config = checkout not live yet) ----------
const LEMON = { checkoutUrl: "", storeId: null, productId: null, price: "$19 once" };
const LS_API="https://api.lemonsqueezy.com/v1/licenses/";
const lic = JSON.parse(localStorage.getItem(APP+"-license")||'{"valid":false}');
const configured = () => !!(LEMON.storeId && LEMON.productId);
async function lsCall(action, params){ const r=await fetch(LS_API+action,{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(params).toString()}); return r.json(); }
const ours = j => !!j && j.meta && +j.meta.store_id===+LEMON.storeId && +j.meta.product_id===+LEMON.productId;
async function activateKey(key){ if(!configured()) return {ok:false, reason:"Checkout opening soon. License keys can't be checked until the store is live."};
  const j=await lsCall("activate",{license_key:key, instance_name:"SweepKit web"}); if(!j.activated) return {ok:false, reason:j.error||"That key could not be activated."};
  if(!ours(j)){ if(j.instance) lsCall("deactivate",{license_key:key, instance_id:j.instance.id}).catch(()=>{}); return {ok:false, reason:"That key is for a different product."}; }
  return {ok:true, instance:j.instance.id}; }
async function validateKey(key, instance){ if(!configured()) return false; const j=await lsCall("validate",{license_key:key, instance_id:instance}); return !!j.valid && ours(j); }
const saveLic = () => localStorage.setItem(APP+"-license",JSON.stringify(lic));
const gated = () => !lic.valid;
function licUI(){ document.getElementById("licOff").hidden=!lic.valid; document.getElementById("licState").textContent = lic.valid ? "Licensed: transition pack ZIP, transition-only stems and 16-bar sections unlocked." :
  `Free: all 9 transitions, live play, MIDI in/out, and WAV + MIDI export of 4- and 8-bar sections. A license (${LEMON.price}) adds the transition-only stem (just the riser/fill, on the grid, to lay over your own track), the pack (all 9 as WAV + MIDI in one ZIP) and 16-bar sections.`; }

// ---------- Web MIDI in/out ----------
let midiAccess=null, midiOut=null, midiInPort=null;
function midiSend(ev,time,sd){ if(!midiOut||!ctx) return; const c=CHAIRS.find(x=>x.id===ev.part), ch=ev.part==="fx"?2:c.ch, at=performance.now()+(time+ev.off*sd-ctx.currentTime)*1000, v=Math.max(1,Math.min(127,Math.round(ev.vel*110)));
  midiOut.send([0x90|ch,ev.note,v],at); midiOut.send([0x80|ch,ev.note,0],at+Math.max(20,(ch===9?0.5:ev.dur)*sd*1000-5)); }
function onMidi(e){ const d=e.data, s=d[0], cmd=s&0xF0, n=d[1], v=d[2]; if(s>=0xF0) return; // clock/start/stop ignored: notes and realtime never start the transport
  if(cmd===0xB0&&n===64){ setSustain(v>=64); return; } if(cmd===0xB0&&(n===123||n===120)){ liveAllOff(); return; }
  if(cmd===0x90&&v>0) liveOn(n,v/127,"midi"); else if(cmd===0x80||(cmd===0x90&&v===0)) liveOff(n,"midi"); }
function refreshMidi(){ if(!midiAccess) return;
  const fill=(sel,ports,cur)=>{ sel.innerHTML='<option value="">(none)</option>'+[...ports.values()].map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join(""); sel.value=[...ports.keys()].includes(cur)?cur:""; };
  fill(ui.midiIn,midiAccess.inputs,state.midiIn); fill(ui.midiOut,midiAccess.outputs,state.midiOut);
  if(midiInPort) midiInPort.onmidimessage=null; midiInPort=midiAccess.inputs.get(ui.midiIn.value)||null; if(midiInPort) midiInPort.onmidimessage=onMidi;
  midiOut=midiAccess.outputs.get(ui.midiOut.value)||null;
  ui.midiNote.textContent = midiAccess.inputs.size ? (midiInPort?`Playing from ${midiInPort.name}. Drum pads (GM notes 35–59) hit the kit, notes 60+ play the pad, below 35 the bass. Velocity and sustain (CC64) work. Notes never start the beat.`:"Pick your controller above.") : "No MIDI controller found. Plug one in; it shows up here."; }

// ---------- live play (MIDI, on-screen pads/keys, computer keys) ----------
const liveVoices=new Map(); let sustain=false; window.__liveLog=[];
const GMDRUM = n => n===35||n===36?"kick":[37,38,39,40].includes(n)?"snare":[42,44,46].includes(n)?"hat":[41,43,45,47,48,50].includes(n)?"toms":[49,51,52,55,57,59].includes(n)?"crash":null;
function liveOn(note,vel,src){ if(!ctx||ctx.state!=="running"){ setStatus("Tap to start audio first."); return; } const t=ctx.currentTime+0.005, key=src+":"+note;
  window.__liveLog.push({note,vel,src,t,playing}); keyVis(note,true);
  if(note>=35&&note<60){ const part=GMDRUM(note); if(!part) return; voice(ctx,bus.live,{part,note:part==="toms"?(TOMF[note]?note:45):note,vel,dur:1,off:0},t,0.1,true); return; }
  const old=liveVoices.get(key); if(old) releaseVoice(old,t);
  if(note<35){ const len=8, g=env(ctx,bus.live,t,0.5*vel,0.005,len,0.05), f=ctx.createBiquadFilter(); f.type="lowpass"; f.frequency.value=700; const o=osc(ctx,"sawtooth",440*Math.pow(2,(note+12-69)/12),t,len+0.1,true); o.connect(f); f.connect(g); liveVoices.set(key,{g,os:[o],sustained:false}); return; }
  const vo=padVoice(ctx,bus.live,note,vel*1.6,t,30,true); vo.sustained=false; liveVoices.set(key,vo); }
function releaseVoice(vo,t){ if(vo.done) return; vo.done=true; const g=vo.g.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value,t); g.linearRampToValueAtTime(0,t+0.25); for(const o of vo.os){ try{ o.stop(t+0.3); }catch(e){} } }
function liveOff(note,src){ const key=src+":"+note, vo=liveVoices.get(key); keyVis(note,false); if(!vo) return; if(sustain){ vo.sustained=true; return; } liveVoices.delete(key); releaseVoice(vo,ctx.currentTime); }
function setSustain(down){ sustain=down; if(!down&&ctx) for(const [k,vo] of [...liveVoices]) if(vo.sustained){ liveVoices.delete(k); releaseVoice(vo,ctx.currentTime); } }
function liveAllOff(){ if(!ctx) return; for(const [,vo] of liveVoices) releaseVoice(vo,ctx.currentTime); liveVoices.clear(); sustain=false; document.querySelectorAll(".down").forEach(k=>k.classList.remove("down")); }
const PADS=[["Kick",36,"A"],["Snare",38,"S"],["Hat",42,"D"],["Tom hi",50,"F"],["Tom mid",47,"G"],["Tom low",43,"H"],["Crash",49,"J"]];
const KEYROW="QWERTYUIOP"; const SCALE_MAJ=[0,2,4,5,7,9,11,12,14,16], SCALE_MIN=[0,2,3,5,7,8,10,12,14,15];
const keyNotes = () => (progOf(state)[0].minor?SCALE_MIN:SCALE_MAJ).map(iv=>12*(state.padOct+1)+state.keyRoot+iv);
function keyVis(n,on){ document.querySelectorAll(`[data-n="${n}"]`).forEach(k=>k.classList.toggle("down",on)); }

// ---------- audio devices: output (setSinkId) + input (getUserMedia deviceId, play-along monitor) ----------
const sinkOK = () => typeof (window.AudioContext||function(){}).prototype.setSinkId === "function";
async function listDevices(){ let devs=[]; try{ devs=await navigator.mediaDevices.enumerateDevices(); }catch(e){}
  const ins=devs.filter(d=>d.kind==="audioinput"&&d.deviceId&&d.deviceId!=="default"), outs=devs.filter(d=>d.kind==="audiooutput"&&d.deviceId&&d.deviceId!=="default");
  ui.audioIn.innerHTML='<option value="">System default input</option>'+ins.map((d,i)=>`<option value="${esc(d.deviceId)}">${esc(d.label||"Audio input "+(i+1))}</option>`).join(""); ui.audioIn.value=ins.some(d=>d.deviceId===state.audioIn)?state.audioIn:"";
  if(!sinkOK()){ ui.audioOut.innerHTML='<option value="">System default</option>'; ui.audioOut.disabled=true; ui.audioOutNote.textContent="This browser can't send Web Audio to a chosen device (no setSinkId); sound uses your system output."; return; }
  ui.audioOut.innerHTML='<option value="">System default</option>'+outs.map((d,i)=>`<option value="${esc(d.deviceId)}">${esc(d.label||"Audio output "+(i+1))}</option>`).join(""); ui.audioOut.value=outs.some(d=>d.deviceId===state.audioOut)?state.audioOut:"";
  if(outs.length&&!outs[0].label) ui.audioOutNote.textContent="Device names appear after you allow the input once; until then they're numbered."; }
async function applySink(){ if(!ctx||!sinkOK()) return; try{ const want=state.audioOut||""; if((typeof ctx.sinkId==="string"?ctx.sinkId:"")!==want) await ctx.setSinkId(want); ui.audioOutNote.textContent=state.audioOut?"Playing through the selected output.":"Playing through the system default output."; }
  catch(e){ ui.audioOutNote.textContent="Couldn't switch output ("+e.name+"); using the system default."; state.audioOut=""; save(); ui.audioOut.value=""; } }
let input=null;
async function enableInput(){ await ensureCtx(); try{ const stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:state.audioIn?{exact:state.audioIn}:undefined,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    const src=ctx.createMediaStreamSource(stream), an=ctx.createAnalyser(), mon=ctx.createGain(); an.fftSize=1024; mon.gain.value=state.monitor?1:0; src.connect(an); src.connect(mon); mon.connect(bus.master);
    input={stream,src,an,mon}; ui.inBtn.textContent="Turn input off"; ui.inState.textContent="Input on: "+(stream.getAudioTracks()[0].label||"default")+(state.monitor?" · monitoring through the desk (use headphones).":" · meter only (monitor off)."); listDevices(); meter(); }
  catch(e){ ui.inState.textContent="Input not available ("+e.name+")."; } }
function disableInput(){ if(!input) return; input.stream.getTracks().forEach(t=>t.stop()); try{ input.src.disconnect(); input.mon.disconnect(); }catch(e){} input=null; ui.inBtn.textContent="Turn input on"; ui.inState.textContent="Input off."; ui.meter.style.width="0%"; }
function meter(){ if(!input) return; const a=new Float32Array(input.an.fftSize); input.an.getFloatTimeDomainData(a); let p=0; for(const x of a) p=Math.max(p,Math.abs(x)); ui.meter.style.width=Math.min(100,p*100)+"%"; requestAnimationFrame(meter); }
if(navigator.mediaDevices&&navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener("devicechange",listDevices);

// ---------- UI ----------
const $=id=>document.getElementById(id), ui={};
["tap","tapBtn","status","bpm","key","chords","chordErr","bars","fillLen","intensity","varLbl","crash","fills","styles","presets","grid","ph","mixer","master","liveGain","pads","keys","octLbl",
 "midiIn","midiOut","midiNote","audioIn","audioOut","audioOutNote","inBtn","inState","monitor","meter","licKey","licBtn","play","stopBtn","fileInfo"].forEach(k=>ui[k]=$(k));
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const setStatus=t=>{ ui.status.textContent=t; };
ui.key.innerHTML=NAMES.map((n,i)=>`<option value="${i}">${n}</option>`).join("");
function cards(el, list, on, click){ el.innerHTML=""; for(const x of list){ const b=document.createElement("button"); b.className="card"+(on(x)?" on":""); b.dataset.id=x.id||x.name; b.innerHTML=`<b>${esc(x.name)}</b><span>${esc(x.blurb||(x.bpm+" BPM · "+x.chords))}</span>`; b.onclick=()=>click(x); el.appendChild(b); } }
function paintGrid(){ const N=state.bars*STEPS, F=state.fill==="none"?0:Math.min(state.fillLen,N); let h=""; for(let b=0;b<state.bars;b++) h+=`<div class="gbar" style="left:${b/state.bars*100}%;width:${100/state.bars}%"><span>${b+1} · ${esc(chordAt(b,state).name)}</span></div>`;
  h+=`<div class="gfill" style="left:${(N-F)/N*100}%;width:${F/N*100}%"></div><div class="ph" id="ph" hidden></div>`; ui.grid.innerHTML=h; ui.ph=$("ph"); }
function paintMixer(){ ui.mixer.innerHTML=CHAIRS.map(c=>`<label class="chair${state.mutes[c.id]?" muted":""}"><span>${esc(c.name)}</span><input type="range" min="0" max="1.2" step="0.01" value="${state.gains[c.id]}" data-gain="${c.id}" aria-label="${esc(c.name)} volume"><span class="mute"><input type="checkbox" data-mute="${c.id}" ${state.mutes[c.id]?"checked":""}> mute</span></label>`).join(""); }
function paintKeys(){ ui.pads.innerHTML=PADS.map(([n,note,k])=>`<button class="pad" data-n="${note}">${n}<small>${k}</small></button>`).join("");
  ui.keys.innerHTML=keyNotes().map((n,i)=>`<button class="pkey" data-n="${n}">${NAMES[pc(n)]}${Math.floor(n/12)-1}<small>${KEYROW[i]}</small></button>`).join(""); ui.octLbl.textContent="Octave "+state.padOct; }
function render(){ ui.bpm.value=state.bpm; ui.key.value=state.keyRoot; if(document.activeElement!==ui.chords) ui.chords.value=state.chords; ui.bars.value=state.bars; ui.fillLen.value=state.fillLen; ui.intensity.value=state.intensity;
  ui.varLbl.textContent="#"+state.variation; ui.crash.checked=state.crash; ui.master.value=state.master; ui.liveGain.value=state.liveGain; ui.monitor.checked=state.monitor;
  cards(ui.fills,FILLS,f=>f.id===state.fill,f=>{ state.fill=f.id; save(); render(); });
  cards(ui.styles,STYLES,s=>s.id===state.style,s=>{ state.style=s.id; save(); render(); });
  cards(ui.presets,PRESETS,()=>false,p=>{ Object.assign(state,{bpm:p.bpm,keyRoot:p.keyRoot,chords:p.chords,style:p.style}); save(); render(); setStatus(`Demo loaded: ${p.name}. Now set your own BPM, key and chords; they're saved.`); });
  paintGrid(); paintKeys(); ui.fileInfo.textContent=`Next export: ${fileBase(state)}.wav + .mid · ${state.bars} bars = ${Math.round(state.bars*4*60/state.bpm*SR).toLocaleString()} samples at 48 kHz / 24-bit`; }
function paintTransport(){ ui.play.classList.toggle("on",playing); ui.play.textContent=playing?"▶ Playing":"▶ Play section"; if(!playing&&ui.ph) ui.ph.hidden=true; }
ui.bpm.addEventListener("change",()=>{ const v=Math.round(+ui.bpm.value); if(!(v>=60&&v<=180)){ ui.bpm.value=state.bpm; setStatus("BPM must be 60–180."); return; } state.bpm=v; save(); render(); });
ui.key.addEventListener("change",()=>{ state.keyRoot=+ui.key.value; save(); render(); });
ui.chords.addEventListener("change",()=>{ if(!parseProg(ui.chords.value)){ ui.chordErr.textContent="Exactly 4 chords, e.g. Am F C G (m, 7, m7, maj7, dim, sus2, sus4)"; return; } ui.chordErr.textContent=""; state.chords=ui.chords.value.trim(); const p=progOf(state); state.keyRoot=p[0].root; save(); render(); });
ui.bars.addEventListener("change",()=>{ const v=+ui.bars.value; if(v>8&&gated()){ ui.bars.value=state.bars; setStatus(`16-bar sections are in the licensed version (${LEMON.price}).`); return; } state.bars=v; if(playing) step=step%(v*STEPS); save(); render(); });
ui.fillLen.addEventListener("change",()=>{ state.fillLen=+ui.fillLen.value; save(); render(); });
ui.intensity.addEventListener("input",()=>{ state.intensity=+ui.intensity.value; save(); });
ui.crash.addEventListener("change",()=>{ state.crash=ui.crash.checked; save(); });
$("varPrev").onclick=()=>{ state.variation=Math.max(1,state.variation-1); save(); render(); }; $("varNext").onclick=()=>{ state.variation++; save(); render(); };
ui.mixer.addEventListener("input",e=>{ const m=e.target.dataset.mute, g=e.target.dataset.gain;
  if(m){ state.mutes[m]=e.target.checked; e.target.closest(".chair").classList.toggle("muted",e.target.checked); } if(g){ state.gains[g]=+e.target.value; if(bus) bus.chairs[g].gain.setTargetAtTime(state.gains[g],ctx.currentTime,0.01); } save(); });
for(const [id,node] of [["master","master"],["liveGain","live"]]) ui[id].addEventListener("input",()=>{ state[id]=+ui[id].value; if(bus) bus[node].gain.setTargetAtTime(state[id],ctx.currentTime,0.01); save(); });
ui.midiIn.addEventListener("change",()=>{ state.midiIn=ui.midiIn.value; save(); refreshMidi(); }); ui.midiOut.addEventListener("change",()=>{ state.midiOut=ui.midiOut.value; save(); refreshMidi(); });
ui.audioOut.addEventListener("change",()=>{ state.audioOut=ui.audioOut.value; save(); applySink(); });
ui.audioIn.addEventListener("change",async()=>{ state.audioIn=ui.audioIn.value; save(); if(input){ disableInput(); await enableInput(); } });
ui.inBtn.onclick=async()=>{ if(input) disableInput(); else await enableInput(); };
ui.monitor.addEventListener("change",()=>{ state.monitor=ui.monitor.checked; save(); if(input) input.mon.gain.setTargetAtTime(state.monitor?1:0,ctx.currentTime,0.02); });
$("octDn").onclick=()=>{ state.padOct=Math.max(2,state.padOct-1); save(); paintKeys(); }; $("octUp").onclick=()=>{ state.padOct=Math.min(6,state.padOct+1); save(); paintKeys(); };
function pointer(box){ const down=new Map(); box.addEventListener("pointerdown",e=>{ const k=e.target.closest("[data-n]"); if(!k) return; e.preventDefault(); const n=+k.dataset.n; down.set(e.pointerId,n); liveOn(n,0.85,"ptr"); });
  const up=e=>{ if(!down.has(e.pointerId)) return; liveOff(down.get(e.pointerId),"ptr"); down.delete(e.pointerId); }; box.addEventListener("pointerup",up); box.addEventListener("pointercancel",up); box.addEventListener("pointerleave",up); }
pointer(ui.pads); pointer(ui.keys);
const held=new Set();
window.addEventListener("keydown",e=>{ if(e.repeat||e.metaKey||e.ctrlKey||/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return; const K=e.key.toUpperCase();
  if(K===" "){ e.preventDefault(); return; } // Space is not a transport key: notes never start the beat; use the Play button
  const p=PADS.find(x=>x[2]===K); if(p){ liveOn(p[1],0.9,"kbd"); return; } const i=KEYROW.indexOf(K); if(i>=0&&K){ const n=keyNotes()[i]; held.add(K); liveOn(n,0.85,"kbd:"+K); } });
window.addEventListener("keyup",e=>{ const K=e.key.toUpperCase(), i=KEYROW.indexOf(K); if(i>=0&&held.has(K)){ held.delete(K); liveOff(keyNotes()[i],"kbd:"+K); } });
ui.play.onclick=async()=>{ await ensureCtx(); start(); }; ui.stopBtn.onclick=()=>stop();
$("exportWav").onclick=async()=>{ setStatus("Rendering at 48 kHz…"); try{ const r=await exportWavBytes(); download(r.bytes,r.name,"audio/wav"); setStatus(`Saved ${r.name} (${r.frames.toLocaleString()} samples, downbeat at sample 0). Drop it on bar 1.`); }catch(e){ setStatus("Export failed: "+e.message); } };
$("exportMid").onclick=()=>{ const r=exportMidBytes(); download(r.bytes,r.name,"audio/midi"); setStatus(`Saved ${r.name}: drums, bass, chords and FX cues on their own tracks, tempo + chord/fill markers.`); };
$("exportPack").onclick=async()=>{ if(gated()){ setStatus(`The transition pack is in the licensed version (${LEMON.price}).`); return; } setStatus("Rendering all 9 transitions…"); const r=await exportPackBytes(); download(r.zip,r.name,"application/zip"); setStatus(`Saved ${r.name} (${r.files.length} files).`); };
$("exportStem").onclick=async()=>{ if(gated()){ setStatus(`The transition-only stem is in the licensed version (${LEMON.price}).`); return; } const r=await exportFillStemBytes(); download(r.bytes,r.name,"audio/wav"); setStatus(`Saved ${r.name}: just the transition, on the same grid: drop it on bar 1 over your own track.`); };
ui.tapBtn.onclick=async()=>{ ui.tapBtn.textContent="Starting…"; await ensureCtx(); if(ctx.state==="running"){ ui.tap.classList.add("hide"); setStatus("Audio on. Press Play section, or hit the pads (A–J) and keys (Q–P)."); } else ui.tapBtn.textContent="Tap again to start audio"; };
ui.licBtn.onclick=async()=>{ const k=ui.licKey.value.trim(); if(!k) return; const st=$("licState"); st.textContent="Checking…";
  try{ const r=await activateKey(k); if(r.ok){ Object.assign(lic,{valid:true,key:k,instance:r.instance,checked:Date.now()}); saveLic(); licUI(); } else st.textContent=r.reason; } catch(e){ st.textContent="Couldn't reach Lemon Squeezy. Try again."; } };
$("licOff").onclick=async()=>{ if(lic.key&&lic.instance&&configured()) await lsCall("deactivate",{license_key:lic.key,instance_id:lic.instance}).catch(()=>{}); for(const k of Object.keys(lic)) delete lic[k]; lic.valid=false; saveLic(); licUI(); };
{ const buy=$("buy"); if(LEMON.checkoutUrl){ buy.href=LEMON.checkoutUrl; buy.textContent="Buy SweepKit · "+LEMON.price; } else { buy.removeAttribute("href"); buy.setAttribute("aria-disabled","true"); buy.textContent="Checkout opening soon · "+LEMON.price; } }
if(lic.valid&&lic.key) validateKey(lic.key,lic.instance).then(v=>{ lic.valid=v; saveLic(); licUI(); }).catch(()=>{});
if(/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)) document.querySelectorAll(".ios").forEach(e=>e.hidden=false);
window.__sweepkit = { state, stepEvents, exportWavBytes, exportMidBytes, exportPackBytes, exportFillStemBytes, renderLoop, liveOn, liveOff, setSustain, start, stop, voices:liveVoices, FILLS, CHAIRS, LEMON,
  get ctx(){return ctx;}, get bus(){return bus;}, get playing(){return playing;}, get sustain(){return sustain;}, get active(){return active.size;}, get lic(){return lic;} };
render(); licUI(); paintMixer(); paintTransport(); listDevices();
if(navigator.requestMIDIAccess) navigator.requestMIDIAccess().then(a=>{ midiAccess=a; a.onstatechange=refreshMidi; refreshMidi(); }).catch(()=>{ ui.midiNote.textContent="Web MIDI unavailable or blocked in this browser. The pads and computer keys still play."; });
else ui.midiNote.textContent="Web MIDI isn't supported in this browser (try Chrome or Edge). The pads and computer keys still play.";
