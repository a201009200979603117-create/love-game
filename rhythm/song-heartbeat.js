/* ==========================================================
   心動節拍：原創曲《心跳的節拍》
   ----------------------------------------------------------
   整首歌都用 Web Audio 即時合成，不需要額外的音檔。
   因為樂譜就在程式裡，譜面可以直接由樂譜產生，
   每個音符都和音樂完全對齊。

   128 BPM，C 大調，和弦以「王道進行」F → G → Em → Am 為主。
========================================================== */

(function (root) {
    "use strict";

    const BPM = 128;
    const BEAT = 60 / BPM;
    const LEAD_IN = 0.5;          // 音檔開頭保留的空白（秒）
    const bt = beat => LEAD_IN + beat * BEAT;   // 拍子 → 秒（從歌曲開頭算）

    /* ---------- 和弦 ---------- */
    const CHORDS = {
        C: [0, 4, 7],
        F: [5, 9, 0],
        G: [7, 11, 2],
        Em: [4, 7, 11],
        Am: [9, 0, 4]
    };

    /* ---------- 主旋律（音名:拍數，- 代表休止，| 只是方便閱讀的小節線） ---------- */
    const MELODY = {
        verse: `
            A4:.5 C5:.5 E5:1 D5:.5 C5:.5 E5:1 |
            F5:1 E5:.5 D5:.5 C5:2 |
            G4:.5 C5:.5 E5:1 D5:.5 C5:.5 D5:1 |
            D5:1 B4:1 G4:2 |
            A4:.5 C5:.5 E5:1 D5:.5 C5:.5 E5:1 |
            A5:1 G5:.5 F5:.5 E5:1 C5:1 |
            D5:1 E5:.5 F5:.5 G5:1 D5:1 |
            B4:2 -:2`,
        build: `
            C5:1 F5:1 A5:1 F5:1 |
            D5:1 G5:1 B5:1 G5:1 |
            E5:1 A5:1 C6:1 A5:1 |
            B5:1 D6:1 G5:2`,
        chorus: `
            F5:.5 G5:.5 A5:1 A5:.5 G5:.5 F5:1 |
            G5:.5 A5:.5 B5:1 B5:.5 A5:.5 G5:1 |
            E5:.5 G5:.5 B5:1 A5:.5 G5:.5 E5:1 |
            A5:1.5 G5:.5 E5:2 |
            F5:.5 G5:.5 A5:1 C6:1 A5:1 |
            B5:.5 A5:.5 G5:1 D6:1 B5:1 |
            C6:1 B5:.5 A5:.5 G5:1 E5:1 |
            C6:3 -:1`,
        outro: `
            A5:2 G5:2 |
            B5:2 D6:2 |
            C6:4 |
            -:4`
    };

    /* ---------- 曲式 ---------- */
    const STRUCTURE = [
        { name: "intro", chords: ["F", "G", "Em", "Am"], drums: "intro", bass: "none", arp: 0.8 },
        { name: "verse", chords: ["Am", "F", "C", "G", "Am", "F", "G", "G"], drums: "verse", bass: "eighths", melody: "verse" },
        { name: "build", chords: ["F", "G", "Am", "G"], drums: "build", bass: "quarters", melody: "build" },
        { name: "chorus", chords: ["F", "G", "Em", "Am", "F", "G", "C", "C"], drums: "chorus", bass: "octaves", melody: "chorus", arp: 0.22 },
        { name: "break", chords: ["Am", "F", "G", "G"], drums: "break", bass: "whole", arp: 0.65 },
        { name: "chorus2", chords: ["F", "G", "Em", "Am", "F", "G", "C", "C"], drums: "chorus", bass: "octaves", melody: "chorus", arp: 0.22, double: true },
        { name: "outro", chords: ["F", "G", "C", "C"], drums: "outro", bass: "outro", melody: "outro" }
    ];

    /* ---------- 鼓組節奏（以十六分音符為單位，0–15） ---------- */
    function drumPattern(style, bar, bars) {
        const hits = [];
        const add = (inst, pos, vel) => hits.push({ inst, pos, vel });
        const eighthHats = vel => { for (let p = 0; p < 16; p += 2) add("hat", p, p % 4 === 0 ? vel : vel * 0.7); };
        const last = bar === bars - 1;

        switch (style) {
            case "intro":
                if (bar >= 2) eighthHats(0.32);
                if (last) { add("kick", 0, 0.8); add("kick", 8, 0.8); add("snare", 12, 0.45); add("snare", 14, 0.6); }
                break;
            case "verse":
                eighthHats(0.4);
                add("kick", 0, 1); add("kick", 8, 0.95); add("kick", 10, 0.75);
                add("snare", 4, 0.8);
                if (last) { add("snare", 12, 0.7); add("snare", 13, 0.55); add("snare", 14, 0.75); add("snare", 15, 0.85); }
                else add("snare", 12, 0.8);
                break;
            case "build":
                eighthHats(0.42);
                if (!last) {
                    [0, 4, 8, 12].forEach(p => add("kick", p, 0.95));
                    add("snare", 4, 0.8); add("snare", 12, 0.8);
                } else {
                    add("kick", 0, 1); add("kick", 4, 1);
                    add("snare", 4, 0.7);
                    for (let p = 8; p < 16; p++) add("snare", p, 0.4 + (p - 8) * 0.07);
                }
                break;
            case "chorus":
                if (bar === 0) add("crash", 0, 1);
                [0, 4, 8, 12].forEach(p => add("kick", p, 1));
                [2, 6, 10, 14].forEach(p => add("ohat", p, 0.55));
                add("snare", 4, 0.9);
                if (last) { add("snare", 12, 0.8); add("snare", 14, 0.85); add("snare", 15, 0.9); }
                else add("snare", 12, 0.9);
                break;
            case "break":
                if (bar >= 2) { eighthHats(0.3); add("kick", 0, 0.85); add("kick", 8, 0.8); }
                if (last) [10, 12, 13, 14, 15].forEach((p, i) => add("snare", p, 0.45 + i * 0.1));
                break;
            case "outro":
                if (bar < 2) {
                    if (bar === 0) add("crash", 0, 1);
                    [0, 4, 8, 12].forEach(p => add("kick", p, 1));
                    [2, 6, 10, 14].forEach(p => add("ohat", p, 0.5));
                    add("snare", 4, 0.9); add("snare", 12, 0.9);
                } else if (bar === 2) {
                    add("crash", 0, 1); add("kick", 0, 1);
                }
                break;
        }
        return hits;
    }

    /* ---------- 小工具 ---------- */
    const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

    function noteToMidi(name) {
        const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
        if (!m) throw new Error("Bad note " + name);
        const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
        return 12 * (parseInt(m[3], 10) + 1) + NOTE_INDEX[m[1]] + acc;
    }

    function parseMelody(text) {
        const out = [];
        let beat = 0;
        text.replace(/\|/g, " ").trim().split(/\s+/).forEach(tok => {
            const [n, d] = tok.split(":");
            const dur = parseFloat(d);
            if (n !== "-") out.push({ beat, dur, midi: noteToMidi(n) });
            beat += dur;
        });
        return { notes: out, length: beat };
    }

    // 把和弦音排在 57–68 之間（給和弦墊音用）
    function voiceChord(name) {
        return CHORDS[name].map(pc => 57 + ((pc - 57) % 12 + 12) % 12).sort((a, b) => a - b);
    }

    const midiToHz = m => 440 * Math.pow(2, (m - 69) / 12);

    /* ==========================================================
       產生整首歌的樂譜事件
    ========================================================== */
    let cachedScore = null;

    function buildScore() {
        if (cachedScore) return cachedScore;
        const events = [];
        const sections = [];
        let barCursor = 0;

        for (const sec of STRUCTURE) {
            const bars = sec.chords.length;
            const startBeat = barCursor * 4;
            sections.push({ name: sec.name, startBeat, bars, chords: sec.chords });

            for (let b = 0; b < bars; b++) {
                const barBeat = startBeat + b * 4;
                const chord = sec.chords[b];
                const root = CHORDS[chord][0];
                const isLastOutroBar = sec.name === "outro" && b === bars - 1;

                // 和弦墊音
                if (!isLastOutroBar) {
                    const ring = sec.name === "outro" && b === bars - 2 ? 7 : 4;
                    voiceChord(chord).forEach(m =>
                        events.push({ inst: "pad", beat: barBeat, dur: ring, midi: m, vel: sec.name === "intro" || sec.name === "break" ? 1 : 0.8, section: sec.name, bar: b }));
                }

                // 鼓
                drumPattern(sec.drums, b, bars).forEach(h =>
                    events.push({ inst: h.inst, beat: barBeat + h.pos / 4, dur: 0, vel: h.vel, section: sec.name, bar: b }));

                // 貝斯
                const bassRoot = 36 + root;
                const style = sec.bass === "outro" ? (b < 2 ? "octaves" : b === 2 ? "whole" : "none") : sec.bass;
                if (style === "eighths") {
                    for (let p = 0; p < 8; p++) {
                        const m = p === 3 || p === 7 ? bassRoot + 12 : bassRoot;
                        events.push({ inst: "bass", beat: barBeat + p / 2, dur: 0.45, midi: m, vel: 0.85, section: sec.name, bar: b });
                    }
                } else if (style === "quarters") {
                    for (let p = 0; p < 4; p++) events.push({ inst: "bass", beat: barBeat + p, dur: 0.9, midi: bassRoot, vel: 0.9, section: sec.name, bar: b });
                } else if (style === "octaves") {
                    for (let p = 0; p < 8; p++) events.push({ inst: "bass", beat: barBeat + p / 2, dur: 0.45, midi: bassRoot + (p % 2 ? 12 : 0), vel: 0.9, section: sec.name, bar: b });
                } else if (style === "whole") {
                    events.push({ inst: "bass", beat: barBeat, dur: sec.name === "outro" ? 6 : 3.8, midi: bassRoot, vel: 0.75, section: sec.name, bar: b });
                }

                // 琶音
                if (sec.arp && !isLastOutroBar) {
                    const tones = voiceChord(chord).map(m => m + 12);
                    const order = [0, 1, 2, 1, 0, 1, 2, 1];
                    order.forEach((idx, p) =>
                        events.push({ inst: "arp", beat: barBeat + p / 2, dur: 0.5, midi: tones[idx], vel: sec.arp, section: sec.name, bar: b, arpIndex: idx }));
                }
            }

            // 主旋律
            if (sec.melody) {
                const mel = parseMelody(MELODY[sec.melody]);
                mel.notes.forEach(n => {
                    events.push({ inst: "lead", beat: startBeat + n.beat, dur: n.dur, midi: n.midi, vel: 1, section: sec.name });
                    if (sec.double) {
                        events.push({ inst: "lead", beat: startBeat + n.beat, dur: n.dur, midi: n.midi - 12, vel: 0.45, section: sec.name, harmony: true });
                    }
                });
            }

            barCursor += bars;
        }

        events.sort((a, b) => a.beat - b.beat);
        cachedScore = { events, sections, lengthBeats: barCursor * 4 };
        return cachedScore;
    }

    /* ==========================================================
       合成器
    ========================================================== */
    function makeNoise(ctx, seconds) {
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
        const data = buf.getChannelData(0);
        let seed = 12345;
        for (let i = 0; i < data.length; i++) {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            data[i] = seed / 0x3fffffff - 1;
        }
        return buf;
    }

    function makeImpulse(ctx, seconds, decay) {
        const len = Math.floor(ctx.sampleRate * seconds);
        const buf = ctx.createBuffer(2, len, ctx.sampleRate);
        let seed = 999;
        for (let c = 0; c < 2; c++) {
            const d = buf.getChannelData(c);
            for (let i = 0; i < len; i++) {
                seed = (seed * 1103515245 + 12345) & 0x7fffffff;
                d[i] = (seed / 0x3fffffff - 1) * Math.pow(1 - i / len, decay);
            }
        }
        return buf;
    }

    function envelope(param, t, attack, peak, decay, sustain, end, release) {
        param.setValueAtTime(0.0001, t);
        param.linearRampToValueAtTime(peak, t + attack);
        param.setTargetAtTime(sustain, t + attack, decay / 3);
        param.setValueAtTime(sustain, Math.max(t + attack + 0.001, end));
        param.linearRampToValueAtTime(0.0001, end + release);
    }

    const INSTRUMENTS = {
        kick(ctx, e, bus) {
            const t = bus.base + bt(e.beat);
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.frequency.setValueAtTime(165, t);
            osc.frequency.exponentialRampToValueAtTime(44, t + 0.12);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.95 * e.vel, t + 0.004);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
            osc.connect(g).connect(bus.master);
            osc.start(t);
            osc.stop(t + 0.45);
        },

        snare(ctx, e, bus) {
            const t = bus.base + bt(e.beat);
            const src = ctx.createBufferSource();
            src.buffer = bus.noise;
            const hp = ctx.createBiquadFilter();
            hp.type = "highpass";
            hp.frequency.value = 1300;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.42 * e.vel, t + 0.003);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
            src.connect(hp).connect(g);
            g.connect(bus.master);
            g.connect(bus.reverb);
            src.start(t, (e.beat * 0.37) % 0.5);
            src.stop(t + 0.22);

            const body = ctx.createOscillator();
            body.type = "triangle";
            body.frequency.setValueAtTime(200, t);
            body.frequency.exponentialRampToValueAtTime(150, t + 0.08);
            const bg = ctx.createGain();
            bg.gain.setValueAtTime(0.0001, t);
            bg.gain.linearRampToValueAtTime(0.3 * e.vel, t + 0.003);
            bg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            body.connect(bg).connect(bus.master);
            body.start(t);
            body.stop(t + 0.14);
        },

        hat(ctx, e, bus) { INSTRUMENTS._hat(ctx, e, bus, 0.05, 0.13); },
        ohat(ctx, e, bus) { INSTRUMENTS._hat(ctx, e, bus, 0.26, 0.1); },

        _hat(ctx, e, bus, length, level) {
            const t = bus.base + bt(e.beat);
            const src = ctx.createBufferSource();
            src.buffer = bus.noise;
            const hp = ctx.createBiquadFilter();
            hp.type = "highpass";
            hp.frequency.value = 7600;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(level * e.vel, t + 0.002);
            g.gain.exponentialRampToValueAtTime(0.001, t + length);
            src.connect(hp).connect(g).connect(bus.master);
            src.start(t, (e.beat * 0.61) % 0.5);
            src.stop(t + length + 0.02);
        },

        crash(ctx, e, bus) {
            const t = bus.base + bt(e.beat);
            const src = ctx.createBufferSource();
            src.buffer = bus.noise;
            src.loop = true;
            const hp = ctx.createBiquadFilter();
            hp.type = "highpass";
            hp.frequency.value = 4200;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.2 * e.vel, t + 0.005);
            g.gain.exponentialRampToValueAtTime(0.001, t + 1.9);
            src.connect(hp).connect(g);
            g.connect(bus.master);
            g.connect(bus.reverb);
            src.start(t);
            src.stop(t + 2);
        },

        bass(ctx, e, bus) {
            const t = bus.base + bt(e.beat);
            const end = t + e.dur * BEAT;
            const f = midiToHz(e.midi);
            const saw = ctx.createOscillator();
            saw.type = "sawtooth";
            saw.frequency.value = f;
            const sub = ctx.createOscillator();
            sub.frequency.value = f;
            const lp = ctx.createBiquadFilter();
            lp.type = "lowpass";
            lp.Q.value = 3;
            lp.frequency.setValueAtTime(1100, t);
            lp.frequency.exponentialRampToValueAtTime(420, t + 0.18);
            const g = ctx.createGain();
            envelope(g.gain, t, 0.006, 0.2 * e.vel, 0.15, 0.13 * e.vel, end, 0.05);
            saw.connect(lp).connect(g);
            const sg = ctx.createGain();
            sg.gain.value = 0.9;
            sub.connect(sg).connect(g);
            g.connect(bus.master);
            saw.start(t); sub.start(t);
            saw.stop(end + 0.08); sub.stop(end + 0.08);
        },

        pad(ctx, e, bus) {
            const t = bus.base + bt(e.beat);
            const end = t + e.dur * BEAT;
            const f = midiToHz(e.midi);
            const lp = ctx.createBiquadFilter();
            lp.type = "lowpass";
            lp.frequency.value = 1500;
            const g = ctx.createGain();
            envelope(g.gain, t, 0.28, 0.04 * e.vel, 0.6, 0.032 * e.vel, end, 0.55);
            [-7, 7].forEach(cents => {
                const o = ctx.createOscillator();
                o.type = "sawtooth";
                o.frequency.value = f;
                o.detune.value = cents;
                o.connect(lp);
                o.start(t);
                o.stop(end + 0.6);
            });
            lp.connect(g);
            g.connect(bus.master);
            g.connect(bus.reverb);
        },

        lead(ctx, e, bus) {
            const t = bus.base + bt(e.beat);
            const len = e.dur * BEAT;
            const end = t + Math.max(0.08, len * 0.92 - 0.02);
            const f = midiToHz(e.midi);
            const lp = ctx.createBiquadFilter();
            lp.type = "lowpass";
            lp.frequency.value = 3400;
            const g = ctx.createGain();
            const level = 0.14 * e.vel;
            envelope(g.gain, t, 0.012, level, 0.2, level * 0.72, end, 0.12);

            const tri = ctx.createOscillator();
            tri.type = "triangle";
            tri.frequency.value = f;
            const saw = ctx.createOscillator();
            saw.type = "sawtooth";
            saw.frequency.value = f;
            saw.detune.value = 4;
            const sawGain = ctx.createGain();
            sawGain.gain.value = 0.28;
            tri.connect(lp);
            saw.connect(sawGain).connect(lp);
            lp.connect(g);
            g.connect(bus.master);
            g.connect(bus.reverb);

            // 長音加一點顫音
            if (len >= BEAT * 0.99) {
                const lfo = ctx.createOscillator();
                lfo.frequency.value = 5.4;
                const depth = ctx.createGain();
                depth.gain.setValueAtTime(0, t);
                depth.gain.linearRampToValueAtTime(9, t + Math.min(0.5, len));
                lfo.connect(depth);
                depth.connect(tri.detune);
                depth.connect(saw.detune);
                lfo.start(t);
                lfo.stop(end + 0.15);
            }
            tri.start(t); saw.start(t);
            tri.stop(end + 0.15); saw.stop(end + 0.15);
        },

        arp(ctx, e, bus) {
            const t = bus.base + bt(e.beat);
            const o = ctx.createOscillator();
            o.type = "triangle";
            o.frequency.value = midiToHz(e.midi);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.1 * e.vel, t + 0.004);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
            o.connect(g);
            g.connect(bus.master);
            g.connect(bus.reverb);
            o.start(t);
            o.stop(t + 0.34);
        }
    };

    /* ----------------------------------------------------------
       即時播放器
       不預先把整首歌算成音檔（太多節點會讓計算變得很慢），
       而是每一幀只排程「接下來 0.6 秒」內的音符。
       暫停時直接 suspend AudioContext，時間會一起停住。
    ---------------------------------------------------------- */
    let cachedImpulse = null;

    function createPlayer(ctx, output) {
        const score = buildScore();
        const events = score.events;

        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.knee.value = 8;
        comp.ratio.value = 4;
        comp.attack.value = 0.003;
        comp.release.value = 0.2;
        const master = ctx.createGain();
        master.gain.value = 0.42;
        master.connect(comp);
        comp.connect(output);

        if (!cachedImpulse || cachedImpulse.sampleRate !== ctx.sampleRate) {
            cachedImpulse = makeImpulse(ctx, 2.2, 3);
        }
        const reverb = ctx.createConvolver();
        reverb.buffer = cachedImpulse;
        const wet = ctx.createGain();
        wet.gain.value = 0.22;
        reverb.connect(wet).connect(master);

        const bus = { master, reverb, noise: makeNoise(ctx, 1), base: 0 };
        let index = 0;
        let started = false;
        let stopped = false;

        return {
            duration: bt(score.lengthBeats) + 2,

            start(when) {
                bus.base = when;
                index = 0;
                started = true;
                this.pump();
            },

            pump(lookahead) {
                if (!started || stopped) return;
                const horizon = ctx.currentTime + (lookahead || 0.6);
                while (index < events.length && bus.base + bt(events[index].beat) < horizon) {
                    const e = events[index++];
                    // 卡頓太久而錯過的音符就跳過，避免一次爆出一堆聲音
                    if (bus.base + bt(e.beat) >= ctx.currentTime - 0.05) {
                        INSTRUMENTS[e.inst](ctx, e, bus);
                    }
                }
            },

            stop() {
                if (stopped) return;
                stopped = true;
                const now = ctx.currentTime;
                master.gain.cancelScheduledValues(now);
                master.gain.setValueAtTime(master.gain.value, now);
                master.gain.linearRampToValueAtTime(0, now + 0.08);
                setTimeout(() => { try { comp.disconnect(); } catch (err) { /* 已中斷 */ } }, 200);
            }
        };
    }

    /* ==========================================================
       由樂譜產生譜面
    ========================================================== */
    const LANE_GAP = { easy: 0.4, normal: 0.2, hard: 0.11 };

    function buildChart(difficulty) {
        const score = buildScore();
        const ev = score.events;
        const sameLaneGap = LANE_GAP[difficulty] || 0.2;
        const candidates = [];   // { beat, lane, durBeats, prio }

        const sectionOf = name => score.sections.find(s => s.name === name);
        const lead = ev.filter(e => e.inst === "lead" && !e.harmony);

        // 主旋律的軌道：以段落內的音域四等分，並讓軌道跟著旋律走向移動
        const leadLane = new Map();
        for (const sec of score.sections) {
            const notes = lead.filter(e => e.section === sec.name);
            if (!notes.length) continue;
            const lo = Math.min(...notes.map(n => n.midi));
            const hi = Math.max(...notes.map(n => n.midi));
            let prev = null;
            for (const n of notes) {
                let lane = Math.min(3, Math.floor((n.midi - lo) / (hi - lo + 1) * 4));
                if (prev) {
                    const dp = n.midi - prev.midi;
                    const quick = (n.beat - prev.beat) < 0.75;
                    if (dp === 0 && quick) lane = prev.lane + (prev.lane < 2 ? 1 : -1);
                    else if (dp !== 0 && lane === prev.lane) lane = Math.max(0, Math.min(3, lane + Math.sign(dp)));
                    if (dp !== 0 && lane === prev.lane) lane = prev.lane - Math.sign(dp);
                }
                lane = Math.max(0, Math.min(3, lane));
                leadLane.set(n, lane);
                prev = { midi: n.midi, beat: n.beat, lane };
            }
        }

        const rootLane = chord => ({ C: 0, Em: 0, F: 1, G: 2, Am: 3 })[chord];
        const add = (beat, lane, durBeats, prio) => candidates.push({ beat, lane, durBeats: durBeats || 0, prio: prio || 0 });
        const leadIn = (name) => lead.filter(e => e.section === name);
        const hasLeadAt = beat => lead.some(e => Math.abs(e.beat - beat) < 0.01);

        for (const sec of score.sections) {
            const name = sec.name;
            const melodic = leadIn(name).length > 0;

            if (!melodic) {
                // 前奏與間奏：沒有主旋律
                const arps = ev.filter(e => e.inst === "arp" && e.section === name);
                if (difficulty === "hard") {
                    arps.forEach(a => add(a.beat, [0, 1, 2, 1][a.arpIndex] + (a.bar % 2), 0, 1));
                    ev.filter(e => e.inst === "snare" && e.section === name && e.bar === sec.bars - 1 && (e.beat % 1) !== 0)
                        .forEach((s, i) => add(s.beat, i % 2 ? 0 : 3, 0, 2));
                } else {
                    sec.chords.forEach((c, b) => add(sec.startBeat + b * 4, rootLane(c), 2, 2));
                    if (difficulty === "normal") {
                        for (let b = 0; b < sec.bars; b++) {
                            const lane = (rootLane(sec.chords[b]) + 2) % 4;
                            add(sec.startBeat + b * 4 + 2.5, lane, 0, 1);
                            add(sec.startBeat + b * 4 + 3, (lane + 1) % 4, 0, 1);
                        }
                    }
                }
                continue;
            }

            // 有主旋律的段落
            for (const n of leadIn(name)) {
                const lane = leadLane.get(n);
                const posInBar = (n.beat - sec.startBeat) % 4;
                if (difficulty === "easy") {
                    if (posInBar % 2 === 0 || n.dur >= 1.5) {
                        add(n.beat, lane, n.dur >= 2 ? n.dur - 0.75 : 0, 3);
                    }
                } else {
                    // 困難：漸強段最後兩拍改成小鼓連打
                    if (difficulty === "hard" && name === "build" && n.beat >= sec.startBeat + 14) continue;
                    add(n.beat, lane, n.dur >= 1.5 ? n.dur - 0.5 : 0, 3);
                }
            }

            if (difficulty === "normal" && (name === "chorus" || name === "chorus2")) {
                for (let b = 0; b < sec.bars; b += 2) {
                    const beat = sec.startBeat + b * 4;
                    const n = lead.find(e => Math.abs(e.beat - beat) < 0.01);
                    if (n) add(beat, leadLane.get(n) < 2 ? 3 : 0, 0, 1);
                }
            }

            if (difficulty === "hard") {
                const drums = ev.filter(e => e.section === name && (e.inst === "kick" || e.inst === "snare" || e.inst === "ohat"));
                for (const d of drums) {
                    const isBarStart = Math.abs((d.beat - sec.startBeat) % 4) < 0.01;
                    if (name === "build" && d.beat >= sec.startBeat + 14) {
                        if (d.inst === "snare") add(d.beat, (d.beat * 4) % 2 ? 1 : 2, 0, 2);
                        continue;
                    }
                    if (hasLeadAt(d.beat)) {
                        // 小節第一拍的大鼓：與主旋律同時按，形成雙押
                        if (d.inst === "kick" && isBarStart) add(d.beat, -1, 0, 1);
                    } else if (!lead.some(e => e.beat < d.beat && e.beat + Math.min(e.dur, 1) > d.beat + 0.01)) {
                        add(d.beat, -1, 0, 0);
                    }
                }
            }
        }

        /* ---- 依時間排序，解決同軌衝突 ---- */
        candidates.sort((a, b) => a.beat - b.beat || b.prio - a.prio);
        const laneFree = [-Infinity, -Infinity, -Infinity, -Infinity];
        const notes = [];
        let lastLane = 1;
        const maxChord = difficulty === "easy" ? 1 : 2;

        for (const c of candidates) {
            const t = bt(c.beat);
            const dur = c.durBeats * BEAT;
            const simultaneous = notes.filter(n => Math.abs(n.t - t) < 0.001);
            if (simultaneous.length >= maxChord) continue;
            const used = simultaneous.map(n => n.lane);

            let order;
            if (c.lane >= 0) {
                order = [c.lane, c.lane + 1, c.lane - 1, c.lane + 2, c.lane - 2, c.lane + 3, c.lane - 3];
            } else {
                // 沒指定軌道：選離上一個音符最遠的位置（換另一隻手）
                const ref = simultaneous.length ? simultaneous[0].lane : lastLane;
                order = [0, 1, 2, 3].sort((a, b) => Math.abs(b - ref) - Math.abs(a - ref));
            }
            const lane = order.find(l => l >= 0 && l < 4 && !used.includes(l) && t - laneFree[l] >= sameLaneGap);
            if (lane === undefined) continue;

            notes.push({ t: Math.round(t * 1000) / 1000, lane, dur: Math.round(dur * 1000) / 1000 });
            laneFree[lane] = t + dur;
            lastLane = lane;
        }

        notes.sort((a, b) => a.t - b.t || a.lane - b.lane);
        return notes;
    }

    // 小節線（給遊戲畫面顯示用）
    function barLines() {
        const score = buildScore();
        const lines = [];
        for (let b = 0; b <= score.lengthBeats; b += 4) lines.push(bt(b));
        return lines;
    }

    const api = {
        id: "heartbeat",
        title: "心跳的節拍",
        artist: "原創曲",
        bpm: BPM,
        duration: bt(buildScore().lengthBeats) + 0.5,
        createPlayer,
        buildChart,
        barLines,
        _buildScore: buildScore
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    } else {
        root.HeartbeatSong = api;
    }
})(typeof window !== "undefined" ? window : globalThis);
