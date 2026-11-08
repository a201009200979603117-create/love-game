/* ==========================================================
   弦光：新手教學
   ----------------------------------------------------------
   依序介紹 Tap、Drag、Hold、Flick，以及會移動、會分線的光弦。
   每個音符都會在音樂裡發出一個音，跟著聲音按就對了。
========================================================== */

(function () {
    "use strict";

    const { ChartBuilder } = Chart;
    const { voice, chord } = Synth;

    const BPM = 110;
    const OFFSET = 0.3;
    const CHORDS = ["C", "G", "Am", "F"];
    const BARS = 30;

    // 五聲音階：位置越右音越高
    const SCALE = [67, 69, 72, 74, 76, 79, 81, 84];
    const pitchOf = pos => SCALE[Math.max(0, Math.min(SCALE.length - 1, Math.round((pos + 0.32) / 0.64 * (SCALE.length - 1))))];

    /* ---------- 教學內容 ---------- */
    function lesson(ch) {
        const A = ch.line({ x: 0.5, y: 0.74 });
        const B = ch.line({ x: 0.5, y: 0.74, alpha: 0 });
        const bar = n => n * 4;


        ch.text(bar(0) + 0.5, bar(2) - 0.5, "歡迎來到弦光\n音符會沿著光弦落下");

        // Tap
        ch.text(bar(2), bar(3) + 2, "Tap\n音符碰到光弦時，點一下");
        [-0.2, 0.2, -0.1, 0.1, -0.25, 0.25].forEach((p, i) => A.tap(bar(3) + i * 2, p));

        // Drag
        ch.text(bar(6) + 0.5, bar(7) + 2, "Drag\n手指放在光弦上，等音符經過，不用點");
        for (let i = 0; i < 12; i++) A.drag(bar(7) + i * 0.5, Math.round((-0.24 + i * 0.04) * 100) / 100);
        for (let i = 0; i < 6; i++) A.drag(bar(9) + 2 + i * 0.25, Math.round((0.2 - i * 0.04) * 100) / 100);

        // Hold
        ch.text(bar(10) + 0.5, bar(11) + 2, "Hold\n點下去並按住，快到尾端時就可以放開");
        A.hold(bar(11), 3, -0.15);
        A.hold(bar(12), 3, 0.15);
        A.hold(bar(13), 1.5, -0.2);
        A.hold(bar(13) + 2, 1.5, 0.2);

        // Flick
        ch.text(bar(14) + 0.5, bar(15) + 2, "Flick\n在光弦上往任意方向快速一滑");
        [0, 0.2, -0.2, 0, 0.15, -0.15].forEach((p, i) => A.flick(bar(15) + i * 2, p));

        // 會動的光弦
        ch.text(bar(18), bar(19) + 1, "光弦會移動、旋轉\n音符永遠沿著光弦的方向前進");
        A.move(bar(19), 4, { x: 0.38, angle: -12 }, "inOutSine");
        A.move(bar(20), 4, { x: 0.62, angle: 12 }, "inOutSine");
        A.move(bar(21), 4, { x: 0.5, angle: 0 }, "inOutSine");
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].forEach(i => A.tap(bar(19) + 1 + i, [-0.15, 0, 0.15, 0][i % 4]));

        // 兩條光弦
        ch.text(bar(22), bar(23) + 1, "有時會分成好幾條\n兩隻手一起來");
        A.move(bar(22) + 2, 2, { x: 0.3, len: 0.24 }, "outCubic");
        B.set("x", bar(22) + 2, 0.5);
        B.set("len", bar(22) + 2, 0.24);
        B.move(bar(22) + 2, 2, { x: 0.7, alpha: 1 }, "outCubic");
        for (let i = 0; i < 8; i++) {
            const b = bar(24) + i * 1;
            (i % 2 ? B : A).tap(b, i % 4 < 2 ? -0.05 : 0.05);
        }
        A.tap(bar(26), 0);
        B.tap(bar(26), 0);
        A.move(bar(26) + 1, 2, { x: 0.5, len: 4 }, "inOutCubic");
        B.move(bar(26) + 1, 2, { x: 0.5, alpha: 0 }, "inOutCubic");

        // 綜合
        ch.text(bar(27), bar(28), "最後，全部一起！");
        A.tap(bar(27) + 3, -0.2);
        for (let i = 0; i < 4; i++) A.drag(bar(28) + i * 0.5, Math.round((-0.12 + i * 0.08) * 100) / 100);
        A.hold(bar(28) + 2, 1.5, 0.2);
        A.flick(bar(29), 0);
        ch.text(bar(29) + 0.5, bar(30) + 2, "完成！\n去挑戰其他歌曲吧");
        A.move(bar(29) + 2, 4, { alpha: 0, y: 0.68 }, "inSine");

        return ch;
    }

    function buildChart() {
        return lesson(new ChartBuilder({ bpm: BPM, offset: OFFSET })).build();
    }

    /* ---------- 音樂：伴奏＋每個音符各自的音 ---------- */
    function buildScore() {
        const ev = [];
        const add = (inst, beat, dur, midi, vel) => ev.push({ inst, beat, dur, midi, vel });
        for (let b = 0; b < BARS; b++) {
            const name = CHORDS[b % 4];
            const start = b * 4;
            voice(name, 55).forEach(m => add("pad", start, 4, m, 0.75));
            const root = chord(name).root;
            add("bass", start, 1.8, 36 + root, 0.7);
            add("bass", start + 2, 1.8, 36 + root, 0.6);
            if (b >= 2 && b < 29) {
                add("kick", start, 0, 0, 0.75);
                add("kick", start + 2, 0, 0, 0.65);
                add("clap", start + 1, 0, 0, 0.5);
                add("clap", start + 3, 0, 0, 0.5);
                for (let p = 0.5; p < 4; p += 1) add("hat", start + p, 0, 0, 0.5);
            }
        }

        // 用一份「乾淨」的譜面找出音符的拍點，替每個音符配上一個音
        const ch = lesson(new ChartBuilder({ bpm: BPM, offset: OFFSET }));
        const seen = new Set();
        ch.lines.forEach(l => l.notes.forEach(n => {
            const key = n.beat + ":" + n.type;
            if (seen.has(key)) return;
            seen.add(key);
            const m = pitchOf(n.pos);
            if (n.type === "hold") add("bell", n.beat, n.len, m, 0.9);
            else if (n.type === "drag") add("pluck", n.beat, 0.25, m + 12, 0.6);
            else if (n.type === "flick") { add("bell", n.beat, 0.5, m, 0.9); add("crash", n.beat, 0, 0, 0.35); }
            else add("pluck", n.beat, 0.5, m, 1);
        }));
        add("impact", 29 * 4, 0, 0, 0.6);
        return { bpm: BPM, offset: OFFSET, lengthBeats: BARS * 4 + 2, events: ev };
    }

    let scoreCache = null;

    window.SONGS = window.SONGS || [];
    window.SONGS.push({
        id: "tutorial",
        title: "新手教學",
        subtitle: "First Light",
        artist: "弦光",
        bpm: BPM,
        length: "1:05",
        cover: "assets/covers/tutorial.jpg",
        difficulties: [{ id: "easy", label: "TUTORIAL", level: 1 }],
        prepare: () => Promise.resolve(),
        createPlayer: (ctx, out) => new Synth.SynthPlayer(ctx, out, scoreCache || (scoreCache = buildScore())),
        buildChart
    });
})();
