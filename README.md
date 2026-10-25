# SweepKit — transitions in your BPM and key

**Live:** https://sweepkit-desk.vercel.app

Pack risers, swells and impacts are printed at someone else's tempo and key. Stretch them and they smear; leave them and they land off the downbeat. SweepKit synthesizes the transition for *your* song and writes it into the end of your section so it lands exactly on 1.

- **Your song first:** BPM, key, 4 chords, section length (4/8/16 bars), groove (backbeat / four-on-floor / trap).
- **9 transitions:** riser (climbs 3 octaves from your key's root), reverse swell, downlifter, sub impact (tuned to your key's root), snare build, tom roll, stop-time, drop-out, half-time. Length (¼ bar to 2 bars), intensity 1–3, crash on 1, seeded variations (same number = same fill, every time).
- **Live:** lookahead scheduler (25 ms tick, 0.12 s ahead). Every change is heard within one bar with no restart.
- **Play along:** Web MIDI in (velocity, sustain CC64, choose device), MIDI out (choose device), computer keys (A–J pads, Q–P scale keys in your key), on-screen pads. Notes never start the transport.
- **Audio I/O:** choose the output device (setSinkId where supported) and an input to monitor or meter your guitar or voice.
- **Export:** 48 kHz / 24-bit WAV at the exact grid length with the tail folded into bar 1 (seamless loop, peak ≤ −1 dBFS), and a multitrack MIDI file (drums ch 10, bass, chords, FX cues, tempo, chord and transition markers).
- **Honest voices:** every sound is a synthesizer and is named as one (synth kick/snare/hat/toms, noise crash, saw bass, saw pad, noise+saw riser/swell/downlifter, sine sub impact). Nothing is downloaded or uploaded. There are no accounts.

## Mobile onboarding
1. Open the link on your phone and tap **Tap to start audio**. (iPhone: flip off the silent switch, or Web Audio stays muted.)
2. Set BPM, key and chords, then pick a transition.
3. Press **Play**. The section loops so you hear the transition land on 1. Use **Next variation** until it fits.
4. Press **Export WAV + MIDI** and AirDrop or save the files to your DAW (GarageBand, BandLab, Koala, etc.).

## Pricing
- **Free:** all 9 transitions, live play, MIDI in/out, and WAV + MIDI export of 4- and 8-bar sections.
- **SweepKit license — $19 one-time** (Lemon Squeezy): transition-only stems to lay over your own track, the whole pack (all 9 as WAV + MIDI in one ZIP), and 16-bar sections. Checkout is not live yet, so the app shows "Checkout opening soon".

## Run / QA
`npm run build` copies the static files to `dist/`. QA: `python3 qa/s9.py URL out.json` (Playwright + numpy + mido). See `docs/acceptance-report.md`.

MIT © WorkinWithAI
