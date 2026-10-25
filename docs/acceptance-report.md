# SweepKit acceptance report (2026-10-25)

Headless Chromium (Playwright, fake media + mocked Web MIDI). Local = python http.server; prod = https://sweepkit-desk.vercel.app. Raw: qa/local-s9.json, qa/prod-s9.json.

| Check | Kind | Local | Prod |
|---|---|---|---|
| c1 exact-length WAV | runtime | PASS: 1001739 frames = expected 1001739, 48000 Hz / 24-bit / 2 ch, peak -1.05 dBFS, first transient 0.0 ms; all 9 transitions same length/peak | PASS: 1001739 frames = expected 1001739, 48000 Hz / 24-bit / 2 ch, peak -1.05 dBFS, first transient 0.0 ms; all 9 transitions same length/peak |
| c2 loop seam / drift | runtime | PASS: 4x loop 4006956 frames (expected 4006956), drift 0 samples; downbeat kick onsets over 32 bars at 2–4 samples (spread 2, trend -0.481 samples/32 bars); seam vs continuous render 0.0031 rel; repeat render maxdiff 1.19e-07 (= 1 24-bit LSB) | PASS: 4x loop 4006956 frames (expected 4006956), drift 0 samples; downbeat kick onsets over 32 bars at 2–4 samples (spread 2, trend -0.481 samples/32 bars); seam vs continuous render 0.0031 rel; repeat render maxdiff 1.19e-07 (= 1 24-bit LSB) |
| c3 hidden-tab stop | runtime | PASS: 30 s hidden → stopped, 0 steps scheduled, 0 sources active | PASS: 30 s hidden → stopped, 0 steps scheduled, 0 sources active |
| c4 live changes ≤1 bar, no restart | runtime | PASS: bpm 0.221 s, mute_bass 0.126 s, fill 0.147 s, style 0.176 s, key 0.197 s | PASS: bpm 0.221 s, mute_bass 0.126 s, fill 0.167 s, style 0.185 s, key 0.217 s |
| c5 pinned samples | runtime | N/A (no samples; all synth, honestly named). External requests during the run: 0 | N/A (no samples; all synth, honestly named). External requests during the run: 0 |
| c6 long-note sustain | runtime | PASS: pad end/mid RMS 1.061 @60, 0.991 @68 BPM | PASS: pad end/mid RMS 1.061 @60, 0.991 @68 BPM |
| c7 static rules | code review (grep of the served app.js) | PASS: @main/@gh-pages 0, Math.random 0, LOOKAHEAD_MS=25, 0.12 s ahead | PASS: @main/@gh-pages 0, Math.random 0, LOOKAHEAD_MS=25, 0.12 s ahead |
| MIDI in (mock device) | runtime | PASS: velocities [[36, 30], [38, 120], [64, 100]]; transport after notes + 0xFA start: False; sustain held 1 voice, 0 after pedal up | PASS: velocities [[36, 30], [38, 120], [64, 100]]; transport after notes + 0xFA start: False; sustain held 1 voice, 0 after pedal up |
| MIDI out (mock device) | runtime | PASS: 268 messages to out1 | PASS: 268 messages to out1 |
| MIDI file | runtime | PASS: type 1, 5 tracks, 92.0 BPM, 20.8696 s (expected 20.8696) | PASS: type 1, 5 tracks, 92.0 BPM, 20.8696 s (expected 20.8696) |
| Keys / Space | runtime | PASS: kbd + pointer notes logged, transport after Space: False | PASS: kbd + pointer notes logged, transport after Space: False |
| Audio I/O | runtime (fake devices) | Lists 3 inputs / 3 outputs, setSinkId True; input meter 0% (fake input silent) → meter NOT VERIFIED | Lists 3 inputs / 3 outputs, setSinkId True; input meter 0% (fake input silent) → meter NOT VERIFIED |
| Live sample rate | runtime | 44100 Hz (device default) | 44100 Hz (device default) |
| Persistence | runtime | PASS: after reload {'bpm': '120', 'key': '2', 'fill': 'snare', 'style': 'four'} | PASS: after reload {'bpm': '120', 'key': '2', 'fill': 'snare', 'style': 'four'} |
| License gate | runtime | PASS: "Checkout opening soon · $19 once" | PASS: "Checkout opening soon · $19 once" |
| Console errors | runtime | 0 | 0 |

## Criteria notes
- c2 onset: the 2–4 sample spread is the threshold rise time of the synth kick on a sub-sample-rounded grid (0.04 ms). Pass = spread ≤ 5 samples, no trend (< 1 sample over 32 bars), drift 0.
- c2 repeat render: 1.19e-7 = one 24-bit LSB (float rounding); pass ≤ 1 LSB.
- c2_env (info only): 1 ms RMS step at the seam is 0.318, vs a p99.9 in-file of 0.285. The seam is the loudest downbeat (crash + impact + kick).

## NOT VERIFIED
- Real hardware: an iPhone/Android, a real MIDI keyboard, real audio interfaces and setSinkId routing to a physical device.
- Lemon Squeezy checkout: no product exists, and the config is empty.
