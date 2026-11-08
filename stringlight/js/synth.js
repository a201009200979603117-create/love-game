/* ==========================================================
   弦光：即時合成器
   ----------------------------------------------------------
   遊戲內的原創曲都由這裡即時合成。樂譜是一串事件：
     { inst, beat, dur, midi, vel }
   播放器每一幀只排程接下來 0.6 秒內的事件，
   暫停時直接 suspend AudioContext，時間會一起停住。
========================================================== */

(function (root) {
    "use strict";

    const midiToHz = m => 440 * Math.pow(2, (m - 69) / 12);

    /* ---------- 作曲小工具 ---------- */
    const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

    function noteToMidi(name) {
        const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
        if (!m) throw new Error("Bad note " + name);
        const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
        return 12 * (parseInt(m[3], 10) + 1) + NOTE_INDEX[m[1]] + acc;
    }

    // "A4:.5 C5:.5 -:1 | E5:2" → [{beat, dur, midi}]
    function parseMelody(text, startBeat) {
        const out = [];
        let beat = startBeat || 0;
        text.replace(/\|/g, " ").trim().split(/\s+/).forEach(tok => {
            const [n, d] = tok.split(":");
            const dur = parseFloat(d);
            if (n !== "-") out.push({ beat, dur, midi: noteToMidi(n) });
            beat += dur;
        });
        return out;
    }

    const CHORD_SHAPES = {
        "": [0, 4, 7],
        m: [0, 3, 7],
        7: [0, 4, 7, 10],
        m7: [0, 3, 7, 10],
        maj7: [0, 4, 7, 11],
        sus2: [0, 2, 7],
        sus4: [0, 5, 7],
        add9: [0, 4, 7, 14]
    };

    // "Am7" → { root: 9, tones: [9, 12, 16, 19] }（相對 C 的半音）
    function chord(name) {
        const m = /^([A-G][#b]?)(.*)$/.exec(name);
        const root = (NOTE_INDEX[m[1][0]] + (m[1][1] === "#" ? 1 : m[1][1] === "b" ? -1 : 0) + 12) % 12;
        const shape = CHORD_SHAPES[m[2]] || CHORD_SHAPES[""];
        return { root, tones: shape.map(s => root + s) };
    }

    // 把和弦音排進 [low, low+12) 的範圍
    function voice(name, low) {
        return chord(name).tones.map(pc => low + ((((pc - low) % 12) + 12) % 12)).sort((a, b) => a - b);
    }

    /* ---------- 音色 ---------- */
    function makeNoise(ctx) {
        const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = buf.getChannelData(0);
        let seed = 12345;
        for (let i = 0; i < d.length; i++) {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            d[i] = seed / 0x3fffffff - 1;
        }
        return buf;
    }

    function makeImpulse(ctx, seconds, decay) {
        const len = Math.floor(ctx.sampleRate * seconds);
        const buf = ctx.createBuffer(2, len, ctx.sampleRate);
        let seed = 777;
        for (let c = 0; c < 2; c++) {
            const d = buf.getChannelData(c);
            for (let i = 0; i < len; i++) {
                seed = (seed * 1103515245 + 12345) & 0x7fffffff;
                d[i] = (seed / 0x3fffffff - 1) * Math.pow(1 - i / len, decay);
            }
        }
        return buf;
    }

    function adsr(param, t, a, peak, d, sus, end, r) {
        param.setValueAtTime(0.0001, t);
        param.linearRampToValueAtTime(peak, t + a);
        param.setTargetAtTime(sus, t + a, Math.max(0.005, d / 3));
        param.setValueAtTime(sus, Math.max(t + a + 0.001, end));
        param.linearRampToValueAtTime(0.0001, end + r);
    }

    function noiseHit(ctx, bus, t, opts) {
        const src = ctx.createBufferSource();
        src.buffer = bus.noise;
        src.loop = !!opts.loop;
        const f = ctx.createBiquadFilter();
        f.type = opts.filter || "highpass";
        f.frequency.value = opts.freq;
        if (opts.q) f.Q.value = opts.q;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(opts.level, t + (opts.attack || 0.002));
        g.gain.exponentialRampToValueAtTime(0.0008, t + opts.length);
        src.connect(f).connect(g);
        g.connect(opts.out || bus.master);
        if (opts.send) g.connect(bus.reverb);
        src.start(t, (t * 0.613) % 0.5);
        src.stop(t + opts.length + 0.02);
        return g;
    }

    const INSTRUMENTS = {
        kick(ctx, e, bus, t) {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.frequency.setValueAtTime(170, t);
            osc.frequency.exponentialRampToValueAtTime(46, t + 0.11);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(1.0 * e.vel, t + 0.003);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
            osc.connect(g).connect(bus.master);
            osc.start(t);
            osc.stop(t + 0.4);
            noiseHit(ctx, bus, t, { freq: 3000, level: 0.12 * e.vel, length: 0.012 });
            // 側鏈：大鼓時把墊音壓下去，做出「呼吸」感
            const sc = bus.duck.gain;
            sc.cancelScheduledValues(t);
            sc.setValueAtTime(1, t);
            sc.linearRampToValueAtTime(0.32, t + 0.012);
            sc.setTargetAtTime(1, t + 0.06, 0.07);
        },

        snare(ctx, e, bus, t) {
            noiseHit(ctx, bus, t, { filter: "bandpass", freq: 2200, q: 0.7, level: 0.42 * e.vel, length: 0.2, send: true });
            const body = ctx.createOscillator();
            body.type = "triangle";
            body.frequency.setValueAtTime(210, t);
            body.frequency.exponentialRampToValueAtTime(160, t + 0.08);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.32 * e.vel, t + 0.003);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            body.connect(g).connect(bus.master);
            body.start(t);
            body.stop(t + 0.14);
        },

        clap(ctx, e, bus, t) {
            [0, 0.011, 0.022].forEach((dt, i) =>
                noiseHit(ctx, bus, t + dt, { filter: "bandpass", freq: 1300, q: 1.2, level: (i === 2 ? 0.4 : 0.28) * e.vel, length: i === 2 ? 0.22 : 0.03, send: i === 2 }));
        },

        hat(ctx, e, bus, t) {
            noiseHit(ctx, bus, t, { freq: 8200, level: 0.12 * e.vel, length: 0.045 });
        },

        ohat(ctx, e, bus, t) {
            noiseHit(ctx, bus, t, { freq: 7600, level: 0.1 * e.vel, length: 0.24 });
        },

        crash(ctx, e, bus, t) {
            noiseHit(ctx, bus, t, { freq: 4800, level: 0.17 * e.vel, length: 2.2, loop: true, send: true, attack: 0.004 });
        },

        bass(ctx, e, bus, t, end) {
            const f = midiToHz(e.midi);
            const saw = ctx.createOscillator();
            saw.type = "sawtooth";
            saw.frequency.value = f;
            const sub = ctx.createOscillator();
            sub.frequency.value = f;
            const lp = ctx.createBiquadFilter();
            lp.type = "lowpass";
            lp.Q.value = 4;
            lp.frequency.setValueAtTime(1400, t);
            lp.frequency.exponentialRampToValueAtTime(380, t + 0.16);
            const g = ctx.createGain();
            adsr(g.gain, t, 0.005, 0.2 * e.vel, 0.12, 0.14 * e.vel, end, 0.04);
            saw.connect(lp).connect(g);
            sub.connect(g);
            g.connect(bus.duck);
            saw.start(t); sub.start(t);
            saw.stop(end + 0.06); sub.stop(end + 0.06);
        },

        pad(ctx, e, bus, t, end) {
            const f = midiToHz(e.midi);
            const lp = ctx.createBiquadFilter();
            lp.type = "lowpass";
            lp.frequency.value = e.bright ? 2600 : 1500;
            const g = ctx.createGain();
            adsr(g.gain, t, 0.25, 0.034 * e.vel, 0.5, 0.028 * e.vel, end, 0.5);
            [-11, 0, 11].forEach(c => {
                const o = ctx.createOscillator();
                o.type = "sawtooth";
                o.frequency.value = f;
                o.detune.value = c;
                o.connect(lp);
                o.start(t);
                o.stop(end + 0.55);
            });
            lp.connect(g);
            g.connect(bus.duck);
            g.connect(bus.reverb);
        },

        lead(ctx, e, bus, t, end) {
            const f = midiToHz(e.midi);
            const lp = ctx.createBiquadFilter();
            lp.type = "lowpass";
            lp.frequency.setValueAtTime(5200, t);
            lp.frequency.exponentialRampToValueAtTime(2600, t + 0.3);
            const g = ctx.createGain();
            const level = 0.085 * e.vel;
            adsr(g.gain, t, 0.008, level, 0.18, level * 0.75, end, 0.1);
            [-14, -5, 5, 14].forEach(c => {
                const o = ctx.createOscillator();
                o.type = "sawtooth";
                o.frequency.value = f;
                o.detune.value = c;
                o.connect(lp);
                o.start(t);
                o.stop(end + 0.14);
            });
            lp.connect(g);
            g.connect(bus.master);
            g.connect(bus.reverb);
            g.connect(bus.delay);
        },

        pluck(ctx, e, bus, t) {
            const f = midiToHz(e.midi);
            const o = ctx.createOscillator();
            o.type = "sawtooth";
            o.frequency.value = f;
            const o2 = ctx.createOscillator();
            o2.type = "square";
            o2.frequency.value = f;
            o2.detune.value = 7;
            const lp = ctx.createBiquadFilter();
            lp.type = "lowpass";
            lp.Q.value = 2;
            lp.frequency.setValueAtTime(4200, t);
            lp.frequency.exponentialRampToValueAtTime(500, t + 0.22);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.07 * e.vel, t + 0.003);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
            const g2 = ctx.createGain();
            g2.gain.value = 0.4;
            o.connect(lp);
            o2.connect(g2).connect(lp);
            lp.connect(g);
            g.connect(bus.master);
            g.connect(bus.reverb);
            g.connect(bus.delay);
            o.start(t); o2.start(t);
            o.stop(t + 0.45); o2.stop(t + 0.45);
        },

        // 簡單的 FM 鐘聲（間奏用）
        bell(ctx, e, bus, t, end) {
            const f = midiToHz(e.midi);
            const car = ctx.createOscillator();
            car.frequency.value = f;
            const mod = ctx.createOscillator();
            mod.frequency.value = f * 3.5;
            const idx = ctx.createGain();
            idx.gain.setValueAtTime(f * 2.2, t);
            idx.gain.exponentialRampToValueAtTime(f * 0.2, t + 0.6);
            mod.connect(idx).connect(car.frequency);
            const g = ctx.createGain();
            const len = Math.max(0.8, end - t + 0.6);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.12 * e.vel, t + 0.004);
            g.gain.exponentialRampToValueAtTime(0.001, t + len);
            car.connect(g);
            g.connect(bus.master);
            g.connect(bus.reverb);
            car.start(t); mod.start(t);
            car.stop(t + len + 0.05); mod.stop(t + len + 0.05);
        },

        // 漸強的噪音上升
        riser(ctx, e, bus, t, end) {
            const src = ctx.createBufferSource();
            src.buffer = bus.noise;
            src.loop = true;
            const bp = ctx.createBiquadFilter();
            bp.type = "bandpass";
            bp.Q.value = 3;
            bp.frequency.setValueAtTime(300, t);
            bp.frequency.exponentialRampToValueAtTime(9000, end);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.16 * e.vel, end);
            g.gain.linearRampToValueAtTime(0.0001, end + 0.05);
            src.connect(bp).connect(g);
            g.connect(bus.master);
            g.connect(bus.reverb);
            src.start(t);
            src.stop(end + 0.08);
        },

        impact(ctx, e, bus, t) {
            const o = ctx.createOscillator();
            o.frequency.setValueAtTime(90, t);
            o.frequency.exponentialRampToValueAtTime(28, t + 1.2);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.6 * e.vel, t + 0.005);
            g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
            o.connect(g).connect(bus.master);
            o.start(t);
            o.stop(t + 1.45);
            noiseHit(ctx, bus, t, { freq: 1200, level: 0.2 * e.vel, length: 1.2, send: true, loop: true });
        }
    };

    /* ---------- 播放器 ---------- */
    let impulseCache = null;

    class SynthPlayer {
        constructor(ctx, output, score) {
            this.ctx = ctx;
            this.score = score;
            this.beatSec = 60 / score.bpm;
            this.offset = score.offset || 0;
            this.events = score.events.slice().sort((a, b) => a.beat - b.beat);
            this.index = 0;
            this.base = 0;
            this.started = false;
            this.stopped = false;

            const comp = ctx.createDynamicsCompressor();
            comp.threshold.value = -14;
            comp.knee.value = 6;
            comp.ratio.value = 4;
            comp.attack.value = 0.003;
            comp.release.value = 0.15;
            const master = ctx.createGain();
            master.gain.value = 0.5;
            master.connect(comp);
            comp.connect(output);

            const duck = ctx.createGain();
            duck.connect(master);

            if (!impulseCache || impulseCache.sampleRate !== ctx.sampleRate) impulseCache = makeImpulse(ctx, 2.6, 3.2);
            const reverb = ctx.createConvolver();
            reverb.buffer = impulseCache;
            const wet = ctx.createGain();
            wet.gain.value = 0.26;
            reverb.connect(wet).connect(master);

            // 附點八分音符的回音
            const delay = ctx.createDelay(1.5);
            delay.delayTime.value = this.beatSec * 0.75;
            const fb = ctx.createGain();
            fb.gain.value = 0.32;
            const dlp = ctx.createBiquadFilter();
            dlp.type = "lowpass";
            dlp.frequency.value = 3000;
            const dwet = ctx.createGain();
            dwet.gain.value = 0.22;
            delay.connect(dlp).connect(fb).connect(delay);
            dlp.connect(dwet).connect(master);

            this.comp = comp;
            this.master = master;
            this.bus = { master, duck, reverb, delay, noise: makeNoise(ctx) };
        }

        get duration() {
            return this.offset + this.score.lengthBeats * this.beatSec + 2;
        }

        start(when) {
            this.base = when;
            this.index = 0;
            this.started = true;
            this.pump();
        }

        pump(lookahead) {
            if (!this.started || this.stopped) return;
            const ctx = this.ctx;
            const horizon = ctx.currentTime + (lookahead || 0.6);
            const ev = this.events;
            while (this.index < ev.length) {
                const e = ev[this.index];
                const t = this.base + this.offset + e.beat * this.beatSec;
                if (t >= horizon) break;
                this.index++;
                if (t < ctx.currentTime - 0.05) continue; // 卡頓錯過的就跳過
                const end = t + Math.max(0.03, (e.dur || 0) * this.beatSec);
                INSTRUMENTS[e.inst](ctx, e, this.bus, t, end);
            }
        }

        stop(fade) {
            if (this.stopped) return;
            this.stopped = true;
            const now = this.ctx.currentTime;
            const g = this.master.gain;
            g.cancelScheduledValues(now);
            g.setValueAtTime(g.value, now);
            g.linearRampToValueAtTime(0, now + (fade || 0.08));
            setTimeout(() => {
                try { this.comp.disconnect(); } catch (err) { /* 已中斷 */ }
            }, ((fade || 0.08) + 0.3) * 1000);
        }
    }

    const api = { SynthPlayer, parseMelody, noteToMidi, chord, voice, midiToHz, INSTRUMENTS };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.Synth = api;
})(typeof window !== "undefined" ? window : globalThis);
