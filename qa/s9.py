import asyncio, base64, json, sys, re, io, wave, numpy as np, mido
from playwright.async_api import async_playwright
URL=sys.argv[1]; OUT=sys.argv[2] if len(sys.argv)>2 else 's9.json'
B64="""async (o)=>{const r=await window.__sweepkit.exportWavBytes(o); let s=''; const b=r.bytes; for(let i=0;i<b.length;i+=32768) s+=String.fromCharCode.apply(null,b.subarray(i,i+32768)); return {name:r.name,b64:btoa(s)};}"""
MOCK="""(()=>{ const sent=[]; window.__midiSent=sent; const inp={id:'in1',name:'Mock Keys 49',type:'input',onmidimessage:null}; const out={id:'out1',name:'Mock Synth Out',type:'output',send:(d,t)=>sent.push({d:[...d],t})};
 const acc={inputs:new Map([['in1',inp]]),outputs:new Map([['out1',out]]),onstatechange:null}; window.__mockIn=inp; navigator.requestMIDIAccess=()=>Promise.resolve(acc); })();"""
def load(b):
  w=wave.open(io.BytesIO(b)); n=w.getnframes(); raw=np.frombuffer(w.readframes(n),dtype=np.uint8).reshape(-1,3)
  v=(raw[:,0].astype(np.int32)|(raw[:,1].astype(np.int32)<<8)|(raw[:,2].astype(np.int32)<<16)); v[v>=1<<23]-=1<<24
  return w.getframerate(),w.getsampwidth(),n,(v/8388607.0).reshape(-1,w.getnchannels()),w.getnchannels()
async def wav(pg,o): r=await pg.evaluate(B64,o); return r['name'],base64.b64decode(r['b64'])
async def main():
  res={}
  async with async_playwright() as p:
    br=await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    ctx=await br.new_context(viewport={'width':1100,'height':900},accept_downloads=True); await ctx.add_init_script(MOCK); pg=await ctx.new_page(); errs=[]; reqs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: m.type=='error' and errs.append(m.text)); pg.on('request',lambda r: reqs.append(r.url))
    await pg.goto(URL); await pg.click('#tapBtn'); await pg.wait_for_function("document.getElementById('tap').classList.contains('hide')")
    res['live_sample_rate']=await pg.evaluate("()=>window.__sweepkit.ctx.sampleRate")
    # c1
    name,b=await wav(pg,{'bpm':92,'bars':8,'fill':'toms','variation':1}); open(name,'wb').write(b); sr,sw,n,x,nc=load(b); m=np.abs(x).max(1); pk=np.abs(x).max()
    exp=round(8*4*60/92*48000); fi=int(np.argmax(m>0.01*pk))
    res['c1']={'file':name,'sr':sr,'bits':sw*8,'ch':nc,'frames':n,'expected':exp,'peak_dBFS':round(20*np.log10(pk),3),'first_transient_sample':fi,'first_transient_ms':round(fi/48,3),
      'peak_in_first_2ms_dBFS':round(20*np.log10(np.abs(x[:96]).max()),2)}
    res['c1']['pass']=n==exp and sr==48000 and sw==3 and res['c1']['peak_dBFS']<=-1.0 and fi/48<=1.0
    # every fill: length + peak
    allf={}
    for f in ['riser','swell','down','toms','snare','stop','drop','half','none']:
      _,bb=await wav(pg,{'bpm':92,'bars':8,'fill':f}); s=load(bb); allf[f]={'frames':s[2],'peak_dBFS':round(20*np.log10(np.abs(s[3]).max()),3),'first_ms':round(int(np.argmax(np.abs(s[3]).max(1)>0.01*np.abs(s[3]).max()))/48,3)}
    res['c1_all_fills']=allf; res['c1_all_fills_pass']=all(v['frames']==exp and v['peak_dBFS']<=-1 and v['first_ms']<=1 for v in allf.values())
    # c2 4x loop
    _,b2=await wav(pg,{'bpm':92,'bars':8,'fill':'toms','variation':1}); x2=load(b2)[3]; t=np.tile(x,(4,1)); N=len(x); d=np.abs(np.diff(t[:,0])); bar=48000*4*60/92
    _,bk=await wav(pg,{'bpm':92,'bars':8,'fill':'none','mutes':{k:True for k in ['snare','hat','toms','crash','bass','chords','fx']}}); xk=np.tile(load(bk)[3][:,0],4); pk=np.abs(xk).max(); dev=[]
    for k in range(32):
      e=int(round(k*bar)); w=np.abs(xk[max(0,e-200):e+200]); dev.append(int(np.argmax(w>0.05*pk))+max(0,e-200)-e)
    seam=await pg.evaluate("""async()=>{const f=window.__sweepkit; const M={snare:true,hat:true,crash:true,fx:true}; const a=await f.renderLoop({bpm:92,bars:8,fill:'toms',variation:1,noNorm:true,mutes:M}), b=await f.renderLoop({bpm:92,bars:8,fill:'toms',variation:1,noNorm:true,loops:2,mutes:M});
      let mx=0, mxSeam=0; for(let c=0;c<2;c++) for(let i=0;i<b.N;i++){ const d=Math.abs(b.ch[c][i]-a.ch[c][i%a.N]); if(d>mx) mx=d; if(Math.abs(i-a.N)<480 && d>mxSeam) mxSeam=d; } let pk=0; for(const x of a.ch[0]) pk=Math.max(pk,Math.abs(x)); return {tonal_chairs_only:'kick,toms,bass,pad (noise voices excluded: white noise shifted by a sub-sample is not comparable sample-by-sample)',N1:a.N,N2:b.N,peak:pk,maxdiff_tiled_vs_continuous_rel:mx/pk,maxdiff_within_10ms_of_seam_rel:mxSeam/pk};}""")
    env=lambda a: np.sqrt(np.convolve(a**2,np.ones(48)/48,mode='valid'))
    e_t=env(t[N-4800:N+4800,0]); jump=float(np.abs(np.diff(e_t[::48])).max()); e_in=env(t[:N,0]); typical=float(np.percentile(np.abs(np.diff(e_in[::48])),99.9))
    res['c2_env']={'full_mix_1ms_rms_max_step_near_seam':round(jump,4),'full_mix_1ms_rms_step_p99.9_in_file':round(typical,4)}
    res['c2']={'total_frames_4x':len(t),'expected_4x':4*exp,'drift_samples':len(t)-4*exp,'downbeat_kick_onset_offsets_samples_32bars':sorted(set(dev)),'onset_spread_samples':max(dev)-min(dev),'onset_trend_samples_over_32_bars':round(float(np.polyfit(range(32),dev,1)[0]*32),3),'onsets_per_bar':dev,
      'seam_vs_continuous_render':seam,'seam_abs_step':[round(float(d[k*N-1]),5) for k in (1,2,3)],'deterministic_maxdiff':float(np.abs(x-x2).max())}
    res['c2']['pass']=res['c2']['drift_samples']==0 and max(dev)-min(dev)<=5 and abs(np.polyfit(range(32),dev,1)[0]*32)<1 and seam['maxdiff_within_10ms_of_seam_rel']<0.05 and seam['maxdiff_within_10ms_of_seam_rel']<=seam['maxdiff_tiled_vs_continuous_rel'] and res['c2']['deterministic_maxdiff']<=2**-23+1e-12
    # c6 sustain: pad only, longest pad (1 bar) at slowest tempo 60 (slowest preset 68 too)
    c6={}
    for bpm in (60,68):
      _,bb=await wav(pg,{'bpm':bpm,'bars':4,'fill':'none','mutes':{k:True for k in ['kick','snare','hat','toms','crash','bass','fx']}}); s=load(bb)[3].mean(1); bn=int(48000*4*60/bpm)
      r=lambda a: float(np.sqrt((a**2).mean())); seg=s[bn:2*bn]; mid=r(seg[int(bn*.3):int(bn*.5)]); end=r(seg[int(bn*.92):int(bn*.99)])
      c6[f'{bpm}bpm']={'note_s':round(bn/48000,3),'rms_30-50%':round(mid,4),'rms_92-99%':round(end,4),'end/mid':round(end/mid,3)}
    c6['pass']=all(v['end/mid']>0.8 for k,v in c6.items()); res['c6']=c6
    # MIDI file
    mm=await pg.evaluate("()=>{const r=window.__sweepkit.exportMidBytes({bpm:92,bars:8,fill:'toms'}); let s=''; for(const x of r.bytes) s+=String.fromCharCode(x); return {name:r.name,b64:btoa(s)}}")
    open(mm['name'],'wb').write(base64.b64decode(mm['b64'])); mf=mido.MidiFile(mm['name'])
    res['midi']={'file':mm['name'],'type':mf.type,'tracks':[t.name for t in mf.tracks],'tempo_bpm':round(mido.tempo2bpm([e for e in mf.tracks[0] if e.type=='set_tempo'][0].tempo),3),
      'length_s':round(mf.length,4),'expected_s':round(8*4*60/92,4),'notes_per_track':[sum(1 for e in t if e.type=='note_on') for t in mf.tracks],'markers':[e.text for e in mf.tracks[0] if e.type=='marker']}
    # c4 live changes
    await pg.evaluate("()=>{const s=document.getElementById('midiOut'); s.value='out1'; s.dispatchEvent(new Event('change'))}")
    await pg.click('#play'); await pg.wait_for_timeout(1500); live={}
    acts=[('bpm',"()=>{const e=document.getElementById('bpm');e.value=120;e.dispatchEvent(new Event('change'))}",lambda e:e['bpm']==120),
          ('mute_bass',"()=>{const e=document.querySelector('[data-mute=bass]');e.checked=true;e.dispatchEvent(new Event('input',{bubbles:true}))}",lambda e:e['mutes']['bass']),
          ('fill',"()=>document.querySelector('#fills [data-id=snare]').click()",lambda e:e['fill']=='snare'),
          ('style',"()=>document.querySelector('#styles [data-id=four]').click()",lambda e:e['style']=='four'),
          ('key',"()=>{const e=document.getElementById('key');e.value='2';e.dispatchEvent(new Event('change'))}",lambda e:e['keyRoot']==2)]
    for nm,act,ok in acts:
      t0=await pg.evaluate("()=>window.__sweepkit.ctx.currentTime"); await pg.evaluate(act); await pg.wait_for_timeout(2200); log=await pg.evaluate("()=>window.__schedLog")
      hit=[e for e in log if e['time']>t0 and ok(e)]; bpmnow=120; barS=4*60/(92 if nm=='bpm' else bpmnow)
      live[nm]={'heard_after_s':round(hit[0]['time']-t0,3) if hit else None,'one_bar_s':round(barS,3),'pass':bool(hit) and hit[0]['time']-t0<=barS}
    live['still_playing_no_restart']=await pg.evaluate("()=>window.__sweepkit.playing"); res['c4']=live
    res['c4']['pass']=all(v['pass'] for v in live.values() if isinstance(v,dict)) and live['still_playing_no_restart']
    # MIDI out while playing
    res['midi_out']={'msgs_sent_while_playing':await pg.evaluate("()=>window.__midiSent.length"),'first5':await pg.evaluate("()=>window.__midiSent.slice(0,5).map(m=>m.d)"),'selected':await pg.evaluate("()=>document.getElementById('midiOut').value")}
    # c3 hidden tab 30 s
    other=await ctx.new_page(); await other.goto('about:blank'); await other.bring_to_front()
    n0=await pg.evaluate("()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));return window.__schedLog.length}")
    await pg.wait_for_timeout(30000); await pg.bring_to_front()
    await pg.evaluate("()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'))}"); await pg.wait_for_timeout(1500)
    res['c3']={'hidden_s':30,'playing_on_return':await pg.evaluate("()=>window.__sweepkit.playing"),'steps_scheduled_while_hidden_and_after':await pg.evaluate("()=>window.__schedLog.length")-n0,
      'active_sources_after':await pg.evaluate("()=>window.__sweepkit.active"),'status':await pg.text_content('#status')}
    res['c3']['pass']=not res['c3']['playing_on_return'] and res['c3']['steps_scheduled_while_hidden_and_after']==0 and res['c3']['active_sources_after']==0
    # MIDI in: velocity, sustain, notes never start transport
    await pg.evaluate("()=>{const sel=document.getElementById('midiIn'); sel.value='in1'; sel.dispatchEvent(new Event('change'))}")
    mi=await pg.evaluate("""async()=>{const f=window.__sweepkit, I=window.__mockIn, snd=d=>I.onmidimessage({data:new Uint8Array(d)}); window.__liveLog.length=0;
      snd([0x90,36,30]); snd([0x90,38,120]); snd([0x90,64,100]); const before=f.voices.size; snd([0xB0,64,127]); snd([0x80,64,0]); await new Promise(r=>setTimeout(r,300));
      const heldAfterOff=f.voices.size, sus=f.sustain; snd([0xB0,64,0]); await new Promise(r=>setTimeout(r,100)); snd([0xFA]);
      return {vels:window.__liveLog.map(e=>[e.note,Math.round(e.vel*127)]), playing_after_notes_and_start_msg:f.playing, pad_voices_held:before, held_after_noteoff_with_pedal:heldAfterOff, sustain_flag:sus, after_pedal_up:f.voices.size,
        inputs:[...document.getElementById('midiIn').options].map(o=>o.text), outputs:[...document.getElementById('midiOut').options].map(o=>o.text), note:document.getElementById('midiNote').textContent}}""")
    mi['pass']=mi['vels']==[[36,30],[38,120],[64,100]] and not mi['playing_after_notes_and_start_msg'] and mi['held_after_noteoff_with_pedal']==1 and mi['after_pedal_up']==0
    res['midi_in']=mi
    # computer keys + on-screen pads, Space doesn't start
    await pg.keyboard.press('a'); await pg.keyboard.press('Space'); await pg.click('.pad[data-n="38"]')
    res['keys']={'log':await pg.evaluate("()=>window.__liveLog.slice(-2).map(e=>[e.note,e.src])"),'playing_after_space':await pg.evaluate("()=>window.__sweepkit.playing")}
    # audio in/out selection with fake devices
    await pg.click('#inBtn'); await pg.wait_for_timeout(1500)
    res['audio_io']={'inputs':await pg.evaluate("()=>[...document.getElementById('audioIn').options].map(o=>o.text)"),'outputs':await pg.evaluate("()=>[...document.getElementById('audioOut').options].map(o=>o.text)"),
      'setSinkId_supported':await pg.evaluate("()=>typeof AudioContext.prototype.setSinkId==='function'"),'in_state':await pg.text_content('#inState'),'meter_max_pct_over_3s':await pg.evaluate("async()=>{let m=0; for(let i=0;i<30;i++){ m=Math.max(m,parseFloat(document.getElementById('meter').style.width)||0); await new Promise(r=>setTimeout(r,100)); } return m;}")}
    # persistence
    await pg.reload(); res['persist']=await pg.evaluate("()=>({bpm:document.getElementById('bpm').value,key:document.getElementById('key').value,fill:window.__sweepkit.state.fill,style:window.__sweepkit.state.style})")
    # license gate
    await pg.click('#tapBtn')
    res['license']={'buy':await pg.text_content('#buy'),'activate_msg':None}
    await pg.fill('#licKey','TEST-KEY'); await pg.click('#licBtn'); await pg.wait_for_timeout(300); res['license']['activate_msg']=await pg.text_content('#licState')
    await pg.screenshot(path='screenshot.png',full_page=True)
    # c5: no sample host; list every non-app request
    host=URL.split('/')[2]; res['c5']={'external_requests':sorted(set(u for u in reqs if host not in u and not u.startswith('data:') and not u.startswith('blob:'))),'note':'no samples: all voices synthesized'}
    # c7 grep
    src=await pg.evaluate("()=>fetch('app.js').then(r=>r.text())"); html=await pg.evaluate("()=>fetch('index.html').then(r=>r.text())")
    exp_path=src[src.index('// ---------- export'):src.index('// ---------- Lemon')]
    res['c7']={'@main/@gh-pages':len(re.findall(r'@main|@gh-pages',src+html)),'Math.random_total':src.count('Math.random'),'Math.random_export_path':exp_path.count('Math.random'),
      'setTimeout_in_scheduling':len(re.findall(r'setTimeout',src)),'voice_names':re.findall(r'name:"([^"]+)", ch',src),'LOOKAHEAD_MS=25':'LOOKAHEAD_MS = 25' in src,'SCHEDULE_AHEAD=0.12':'SCHEDULE_AHEAD = 0.12' in src}
    res['c7']['pass']=res['c7']['@main/@gh-pages']==0 and res['c7']['Math.random_total']==0
    res['errors']=errs
    print(json.dumps(res,indent=1)); json.dump(res,open(OUT,'w'),indent=1); await br.close()
asyncio.run(main())
