/* ==========================================================
   弦光：原創曲《流光迴路 Lumen Circuit》
   ----------------------------------------------------------
   150 BPM，A 小調，約 1 分 43 秒
   前奏 → 主歌 → 漸強 → 高潮 → 間奏（判定線轉成直立）→ 漸強 → 高潮二 → 尾聲
========================================================== */

(function () {
    "use strict";

    const { parseMelody, voice, chord } = Synth;
    const { ChartBuilder } = Chart;

    const BPM = 150;
    const OFFSET = 0.3;

    /* ---------- 曲式（每個和弦一小節） ---------- */
    const SECTIONS = [
        { name: "intro", chords: ["Am", "F", "C", "G"] },
        { name: "verse", chords: ["Am", "F", "C", "G", "Am", "F", "C", "G"] },
        { name: "build", chords: ["F", "G", "Am", "G"] },
        { name: "drop", chords: ["F", "G", "Em", "Am", "F", "G", "Em", "Am", "F", "G", "C", "E", "F", "G", "Am", "Am"] },
        { name: "break", chords: ["Am", "F", "C", "G", "Am", "F", "C", "G"] },
        { name: "build2", chords: ["F", "G", "Am", "G"] },
        { name: "drop2", chords: ["F", "G", "Em", "Am", "F", "G", "Em", "Am", "F", "G", "C", "E", "F", "G", "Am", "Am"] },
        { name: "outro", chords: ["Am", "F", "G", "Am"] }
    ];
    let bar = 0;
    SECTIONS.forEach(s => { s.start = bar * 4; s.bars = s.chords.length; s.end = s.start + s.bars * 4; bar += s.bars; });
    const SEC = {};
    SECTIONS.forEach(s => { SEC[s.name] = s; });
    const LENGTH = bar * 4;

    /* ---------- 旋律 ---------- */
    const MEL = {
        verse: `
            E5:.5 A5:.5 C6:.5 B5:.5 A5:1 E5:1 |
            F5:.5 A5:.5 C6:.5 A5:.5 G5:1 F5:1 |
            E5:.5 G5:.5 C6:.5 D6:.5 E6:1 C6:1 |
            D6:1.5 B5:.5 G5:2 |
            E5:.5 A5:.5 C6:.5 B5:.5 A5:1 C6:1 |
            A5:.5 C6:.5 F6:.5 E6:.5 C6:1 A5:1 |
            G5:.5 C6:.5 E6:1 D6:.5 C6:.5 B5:1 |
            B5:2 D6:2`,
        build: `
            F5:.5 A5:.5 C6:.5 A5:.5 F5:.5 A5:.5 C6:.5 F6:.5 |
            G5:.5 B5:.5 D6:.5 B5:.5 G5:.5 B5:.5 D6:.5 G6:.5 |
            A5:.5 C6:.5 E6:.5 C6:.5 A5:.5 C6:.5 E6:.5 A6:.5 |
            B5:1 D6:1 G6:1 -:1`,
        drop: `
            A5:.75 C6:.75 A5:.5 G5:.5 A5:.5 C6:1 |
            D6:.75 B5:.75 G5:.5 D6:1 B5:1 |
            E6:.75 D6:.75 B5:.5 G5:.5 B5:.5 E6:1 |
            C6:1.5 B5:.5 A5:2 |
            A5:.75 C6:.75 A5:.5 G5:.5 A5:.5 F6:1 |
            G6:.75 F6:.75 D6:.5 B5:1 D6:1 |
            E6:.75 G6:.75 E6:.5 D6:.5 B5:.5 G5:1 |
            A5:3 -:1 |
            A5:.75 C6:.75 A5:.5 G5:.5 A5:.5 C6:1 |
            D6:.75 B5:.75 G5:.5 D6:1 B5:1 |
            E6:.75 G6:.75 E6:.5 C6:.5 D6:.5 E6:1 |
            G#6:1.5 B6:.5 G#6:1 E6:1 |
            A5:.75 C6:.75 F6:.5 E6:.5 C6:.5 A5:1 |
            B5:.75 D6:.75 G6:.5 F6:.5 D6:.5 B5:1 |
            C6:.75 E6:.75 A6:1.5 G6:1 |
            A6:3 -:1`,
        break: `
            E5:1 A5:1 C6:2 |
            C6:1 A5:1 F5:2 |
            G5:1 C6:1 E6:2 |
            D6:2 B5:2 |
            E6:1 D6:1 C6:2 |
            A5:1 C6:1 F6:2 |
            E6:1.5 D6:.5 C6:2 |
            B5:4`,
        outro: `
            A5:1 C6:1 E6:2 |
            F6:2 E6:2 |
            D6:2 B5:2 |
            A5:4`
    };

    const melody = name => parseMelody(MEL[name === "drop2" ? "drop" : name === "build2" ? "build" : name], SEC[name].start);

    /* ==========================================================
       編曲
    ========================================================== */
    function buildScore() {
        const ev = [];
        const add = (inst, beat, dur, midi, vel, extra) => ev.push(Object.assign({ inst, beat, dur, midi, vel: vel === undefined ? 1 : vel }, extra));

        for (const s of SECTIONS) {
            s.chords.forEach((name, i) => {
                const b = s.start + i * 4;
                const last = i === s.bars - 1;
                const root = chord(name).root;
                const bass = 33 + ((root - 9 + 12) % 12); // A1～G#2
                const drop = s.name === "drop" || s.name === "drop2";
                const build = s.name === "build" || s.name === "build2";

                // 墊音
                if (!(s.name === "outro" && i === s.bars - 1)) {
                    voice(name, 57).forEach(m => add("pad", b, 4, m, drop ? 1 : 0.9, { bright: drop }));
                } else {
                    voice(name, 57).forEach(m => add("pad", b, 7, m, 0.9));
                }

                // 鼓
                const hit = (inst, pos, vel) => add(inst, b + pos, 0, 0, vel);
                if (s.name === "intro") {
                    if (last) add("riser", b, 4, 0, 0.8);
                } else if (s.name === "verse") {
                    hit("kick", 0, 1); hit("kick", 2.5, 0.8);
                    hit("clap", 1, 0.8); hit("clap", 3, 0.8);
                    for (let p = 0; p < 4; p += 0.5) hit("hat", p, p % 1 ? 0.7 : 1);
                    if (last) { hit("snare", 3.5, 0.6); hit("snare", 3.75, 0.8); }
                } else if (build) {
                    if (i === 0) add("riser", b, 16, 0, 1);
                    [0, 1, 2, 3].forEach(p => hit("kick", p, 0.9));
                    const step = i < 2 ? 0.5 : 0.25;
                    const stop = last ? 3 : 4;
                    for (let p = 0; p < stop; p += step) hit("snare", p, 0.35 + 0.15 * i + p * 0.04);
                } else if (drop) {
                    if (i === 0 || i === 8) { hit("crash", 0, 1); hit("impact", 0, i === 0 ? 1 : 0.6); }
                    [0, 1, 2, 3].forEach(p => hit("kick", p, 1));
                    hit("clap", 1, 1); hit("clap", 3, 1);
                    [0.5, 1.5, 2.5, 3.5].forEach(p => hit("ohat", p, 0.8));
                    for (let p = 0; p < 4; p += 0.25) if (p % 0.5) hit("hat", p, 0.45);
                    if (last) { hit("snare", 3, 0.7); hit("snare", 3.25, 0.8); hit("snare", 3.5, 0.9); hit("snare", 3.75, 1); }
                } else if (s.name === "break") {
                    if (i >= 4) for (let p = 0; p < 4; p += 0.5) hit("hat", p, 0.5);
                    if (last) { hit("kick", 0, 0.8); hit("kick", 2, 0.8); hit("clap", 3, 0.8); }
                } else if (s.name === "outro") {
                    if (i === 0) { hit("crash", 0, 1); hit("impact", 0, 1); hit("kick", 0, 1); }
                }

                // 貝斯
                if (drop) {
                    add("bass", b, 0.4, bass, 1);
                    [0.5, 1.5, 2.5, 3.5].forEach(p => add("bass", b + p, 0.4, bass + 12, 0.9));
                } else if (s.name === "verse") {
                    for (let p = 0; p < 4; p += 0.5) add("bass", b + p, 0.42, p === 1.5 || p === 3.5 ? bass + 12 : bass, 0.85);
                } else if (build) {
                    [0, 1, 2, 3].forEach(p => { if (!(last && p === 3)) add("bass", b + p, 0.9, bass, 0.9); });
                } else if (s.name === "break") {
                    add("bass", b, 3.9, bass, 0.6);
                } else if (s.name === "outro" && i < s.bars - 1) {
                    add("bass", b, 3.9, bass, 0.7);
                }

                // 琶音
                if (s.name === "intro" || s.name === "drop2") {
                    const tones = voice(name, 69);
                    const order = [0, 1, 2, 1, 2, 0, 1, 2];
                    order.forEach((k, p) => add("pluck", b + p * 0.5, 0.5, tones[k % tones.length], s.name === "intro" ? 0.9 : 0.4, { arp: true, arpIndex: k }));
                }
            });

            // 主旋律
            if (MEL[s.name] || s.name === "drop2" || s.name === "build2") {
                const inst = s.name.startsWith("drop") ? "lead"
                    : s.name === "break" || s.name === "outro" ? "bell"
                        : "pluck";
                melody(s.name).forEach(n => {
                    add(inst, n.beat, n.dur, n.midi, 1);
                    if (s.name === "drop2") add("lead", n.beat, n.dur, n.midi - 12, 0.45);
                });
            }
        }
        return { bpm: BPM, offset: OFFSET, lengthBeats: LENGTH + 2, events: ev };
    }

    /* ==========================================================
       譜面
    ========================================================== */

    // 旋律音高 → 沿判定線的位置
    function pitchMapper(notes, range) {
        const lo = Math.min.apply(null, notes.map(n => n.midi));
        const hi = Math.max.apply(null, notes.map(n => n.midi));
        return n => Math.round((((n.midi - lo) / Math.max(1, hi - lo)) * 2 - 1) * range * 100) / 100;
    }

    function choreograph(ch) {
        const A = ch.line({ x: 0.5, y: 0.62, alpha: 0 });
        const B = ch.line({ x: 0.5, y: 0.76, alpha: 0 });

        // 前奏：主線浮現
        A.to("alpha", 0, 2, 1, "outSine");
        A.to("y", 0, 4, 0.72, "outCubic");

        // 主歌：左右輕輕擺動
        for (let k = 0; k < 4; k++) {
            const b = SEC.verse.start + k * 8;
            A.move(b, 8, { x: k % 2 ? 0.56 : 0.44, angle: k % 2 ? 3 : -3 }, "inOutSine");
        }

        // 漸強：回到中央、加速，最後分成兩條線
        const bs = SEC.build.start;
        A.move(bs, 4, { x: 0.5, angle: 0, y: 0.76 }, "inOutCubic");
        A.speed(bs + 8, 1.15).speed(bs + 12, 1.3);
        A.move(bs + 14, 2, { x: 0.3, len: 0.24 }, "outCubic");
        B.set("len", bs + 14, 0.24);
        B.to("alpha", bs + 14, bs + 16, 1, "outSine");
        B.to("x", bs + 14, bs + 16, 0.7, "outCubic");

        // 高潮：左右兩條線
        const d = SEC.drop.start;
        A.speed(d, 1.2);
        B.speed(d, 1.2);
        for (let k = 0; k < 8; k++) {
            const b = d + k * 4;
            A.to("angle", b, b + 1, k % 2 ? -6 : 6, "outBack");
            B.to("angle", b, b + 1, k % 2 ? 6 : -6, "outBack");
        }
        A.to("angle", d + 32, d + 34, 0, "inOutSine");
        B.to("angle", d + 32, d + 34, 0, "inOutSine");
        for (let k = 0; k < 6; k++) {
            const b = d + 32 + k * 4;
            A.to("y", b, b + 4, k % 2 ? 0.8 : 0.68, "inOutSine");
            B.to("y", b, b + 4, k % 2 ? 0.68 : 0.8, "inOutSine");
        }
        A.move(d + 56, 4, { y: 0.74 }, "inOutSine");
        B.move(d + 56, 4, { y: 0.74 }, "inOutSine");
        A.move(d + 60, 4, { x: 0.5, len: 4 }, "inOutCubic");
        B.move(d + 60, 4, { x: 0.5, alpha: 0 }, "inOutCubic");

        // 間奏：主線轉成直立，音符從右邊過來
        const br = SEC.break.start;
        A.speed(br, 0.85);
        A.move(br, 2, { x: 0.26, y: 0.5, angle: 90 }, "outCubic");
        A.move(br + 8, 8, { y: 0.46 }, "inOutSine");
        A.move(br + 16, 8, { y: 0.54 }, "inOutSine");
        A.move(br + 24, 4, { x: 0.5, y: 0.75, angle: 0 }, "inOutCubic");

        // 漸強二
        const b2 = SEC.build2.start;
        A.speed(b2, 1.1).speed(b2 + 8, 1.25).speed(b2 + 12, 1.4);
        A.move(b2 + 14, 2, { x: 0.3, len: 0.24 }, "outCubic");
        B.set("y", b2, 0.75);
        B.to("alpha", b2 + 14, b2 + 16, 1, "outSine");
        B.to("x", b2 + 14, b2 + 16, 0.7, "outCubic");

        // 高潮二：更大的擺動，兩條線交換位置，最後合而為一
        const d2 = SEC.drop2.start;
        A.speed(d2, 1.3);
        B.speed(d2, 1.3);
        for (let k = 0; k < 8; k++) {
            const b = d2 + k * 4;
            A.to("angle", b, b + 1.5, k % 2 ? -10 : 10, "outBack");
            B.to("angle", b, b + 1.5, k % 2 ? 10 : -10, "outBack");
        }
        A.to("angle", d2 + 30, d2 + 32, 0, "inOutSine");
        B.to("angle", d2 + 30, d2 + 32, 0, "inOutSine");
        A.move(d2 + 32, 4, { x: 0.7, y: 0.7 }, "inOutBack");
        B.move(d2 + 32, 4, { x: 0.3, y: 0.78 }, "inOutBack");
        A.move(d2 + 40, 4, { x: 0.3, y: 0.76 }, "inOutBack");
        B.move(d2 + 40, 4, { x: 0.7, y: 0.76 }, "inOutBack");
        A.move(d2 + 48, 4, { angle: -12 }, "outCubic");
        B.move(d2 + 48, 4, { angle: 12 }, "outCubic");
        A.move(d2 + 60, 4, { x: 0.5, angle: 0, y: 0.72, len: 4 }, "inOutCubic");
        B.move(d2 + 60, 4, { x: 0.5, angle: 0, y: 0.72, alpha: 0 }, "inOutCubic");

        // 尾聲
        const o = SEC.outro.start;
        A.speed(o, 0.9);
        A.move(o + 12, 4, { alpha: 0, y: 0.66 }, "inSine");

        return { A, B };
    }

    // 判定線在某拍時的位置範圍（分成兩條線時要縮小）
    function laneRange(name, beat) {
        if (name === "drop" || name === "drop2") return 0.15;
        if (name === "break") return 0.17;
        if ((name === "build" || name === "build2") && beat >= SEC[name].start + 14) return 0.15;
        return 0.33;
    }

    function buildChart(level) {
        const ch = new ChartBuilder({ bpm: BPM, offset: OFFSET });
        const { A, B } = choreograph(ch);
        const easy = level === "easy";
        const hard = level === "hard";

        // 判定線轉動時不放音符
        const blocked = beat =>
            beat === SEC.outro.start ||   // 尾聲第一拍改成 Flick
            (beat >= SEC.break.start && beat < SEC.break.start + 2) ||
            (beat >= SEC.break.start + 24 && beat < SEC.break.start + 28) ||
            (beat >= SEC.drop2.start + 32 && beat < SEC.drop2.start + 36 && !hard) ||
            (beat >= SEC.drop2.start + 40 && beat < SEC.drop2.start + 44 && !hard);

        /* ---- 前奏 ---- */
        const intro = SEC.intro;
        const introPos = [-0.18, 0.16, -0.06, 0.22];
        for (let i = 0; i < intro.bars; i++) {
            const b = intro.start + i * 4;
            if (easy) {
                A.hold(b, 3, introPos[i]);
            } else if (!hard) {
                A.hold(b, 1.5, introPos[i]);
                [2, 2.5, 3, 3.5].forEach((p, k) => A.drag(b + p, introPos[i] + (k % 2 ? 0.1 : 0.2) * (introPos[i] > 0 ? -1 : 1)));
            } else {
                A.hold(b, 1, introPos[i]);
                const arps = [1, 1.5, 2, 2.5, 3, 3.5];
                arps.forEach((p, k) => A.tap(b + p, [-0.24, -0.08, 0.08, 0.24, 0.08, -0.08][k] * (i % 2 ? -1 : 1)));
            }
        }

        /* ---- 有主旋律的段落 ---- */
        for (const name of ["verse", "build", "drop", "break", "build2", "drop2", "outro"]) {
            const s = SEC[name];
            const mel = melody(name);
            const range = b => laneRange(name, b);
            const map = pitchMapper(mel, 1);
            const isDrop = name.startsWith("drop");
            const isBuild = name.startsWith("build");

            mel.forEach((n, idx) => {
                if (blocked(n.beat)) return;
                // 困難：漸強最後一小節改成小鼓連打
                if (hard && isBuild && n.beat >= s.start + 12) return;
                const pos = map(n) * range(n.beat);
                const inBar = (n.beat - s.start) % 4;
                const longNote = n.dur >= 1.5;
                const holdLen = n.dur - (n.dur >= 3 ? 1 : 0.5);

                if (easy) {
                    if (name === "break" || name === "outro") {
                        if (longNote) A.hold(n.beat, holdLen, pos);
                        else if (inBar % 2 === 0) A.tap(n.beat, pos);
                    } else if (isBuild) {
                        if (inBar % 2 === 0 || n.beat >= s.start + 12) A.tap(n.beat, pos);
                    } else if (longNote && n.dur >= 2) {
                        A.hold(n.beat, holdLen, pos);
                    } else if (inBar === 0 || inBar === 2) {
                        A.tap(n.beat, pos);
                    }
                    return;
                }

                if (!hard) {
                    // 普通：短音用 Drag 連成一串，長音用 Hold
                    if (longNote) A.hold(n.beat, holdLen, pos);
                    else if (n.dur <= 0.5 && !(name === "break" || name === "outro")) A.drag(n.beat, pos);
                    else A.tap(n.beat, pos);
                    return;
                }

                // 困難：全部點擊，長音 Hold
                if (longNote) A.hold(n.beat, holdLen, pos);
                else A.tap(n.beat, pos);
            });

            /* 第二條線與鼓點 */
            if (isDrop) {
                // 最後一小節兩條線要合併，第二條線不放音符
                for (let i = 0; i < s.bars - 1; i++) {
                    const b = s.start + i * 4;
                    const phrase = i % 4 === 0;
                    if (phrase && !blocked(b)) B.flick(b, 0);
                    if (easy) continue;
                    const second = name === "drop2" || i >= 8;
                    [0, 1, 2, 3].forEach(p => {
                        if (blocked(b + p) || (p === 0 && phrase)) return;
                        if (!hard) {
                            if (second && p % 2) B.drag(b + p, p === 1 ? -0.08 : 0.08);
                            return;
                        }
                        // 困難：大鼓 Drag ＋ 拍手 Tap
                        if (p % 2) B.tap(b + p, p === 1 ? -0.1 : 0.1);
                        else B.drag(b + p, 0);
                    });
                }
            }

            if (isBuild && hard) {
                // 小鼓連打：最後一小節用十六分音符的 Drag 從左掃到右
                for (let k = 0; k < 12; k++) {
                    A.drag(s.start + 12 + k * 0.25, Math.round((-0.15 + (0.3 * k) / 11) * 100) / 100);
                }
            }
        }

        /* ---- 間奏的額外音符（困難） ---- */
        if (hard) {
            const br = SEC.break;
            for (let b = br.start + 16; b < br.start + 24; b += 1) {
                A.drag(b + 0.5, -0.13);
            }
        }

        /* ---- 尾聲：最後的重音 ---- */
        const o = SEC.outro.start;
        A.flick(o, -0.25);
        if (!easy) A.flick(o, 0.25);

        return ch.build();
    }

    let scoreCache = null;
    const score = () => scoreCache || (scoreCache = buildScore());

    window.SONGS = window.SONGS || [];
    window.SONGS.push({
        id: "lumen",
        title: "流光迴路",
        subtitle: "Lumen Circuit",
        artist: "弦光 原創",
        bpm: BPM,
        length: "1:43",
        cover: "assets/covers/lumen.jpg",
        difficulties: [
            { id: "easy", label: "EASY", level: 3 },
            { id: "normal", label: "NORMAL", level: 7 },
            { id: "hard", label: "HARD", level: 11 }
        ],
        prepare: () => Promise.resolve(),
        createPlayer: (ctx, out) => new Synth.SynthPlayer(ctx, out, score()),
        buildChart
    });
})();
