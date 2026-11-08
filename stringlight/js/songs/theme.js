/* ==========================================================
   弦光：《心動的每一天》（主題曲 audio/theme.mp3）
   ----------------------------------------------------------
   這首歌沒有固定拍子，譜面由 tools/analyze-onsets.js 預先分析的
   「起音」產生（js/songs/theme-onsets.js）：
   - 依難度挑選起音，音高決定位置
   - 快速連續的音變成 Drag、延音變成 Hold、最強的重音變成 Flick
   - 音樂比較激昂的段落，光弦會分成左右兩條
   寫譜時把 BPM 設成 60，所以「拍」就等於「秒」。
========================================================== */

(function () {
    "use strict";

    const { ChartBuilder, mulberry32 } = Chart;
    const DATA = window.THEME_ONSETS;
    const ONSETS = DATA.rows.map(r => ({ t: r[0] / 1000, rel: r[1] / 100, str: r[2] / 100, pitch: r[3] || 60, sus: r[4] / 100 }));
    const DURATION = DATA.duration;

    const LEVEL = {
        easy: { density: 0.85, minGap: 0.42, holdGap: 1.0, holdRatio: 0.2, runGap: 0, flickRatio: 0.02 },
        normal: { density: 1.6, minGap: 0.21, holdGap: 0.85, holdRatio: 0.12, runGap: 0.27, flickRatio: 0.03 },
        hard: { density: 2.6, minGap: 0.12, holdGap: 0.75, holdRatio: 0.08, runGap: 0.2, flickRatio: 0.035 }
    };

    /* ---------- 挑選起音 ---------- */
    function pick(cfg) {
        const pool = ONSETS.filter(o => o.t > 1.2 && o.t < DURATION - 1)
            .map((o, i) => ({ o, i, score: o.rel * 0.75 + o.str * 0.25 }))
            .sort((a, b) => b.score - a.score);
        const target = Math.round(DURATION * cfg.density);
        const times = [];
        const chosen = [];
        for (const p of pool) {
            if (chosen.length >= target) break;
            const t = p.o.t;
            let lo = 0;
            let hi = times.length;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (times[mid] < t) lo = mid + 1; else hi = mid;
            }
            if ((lo > 0 && t - times[lo - 1] < cfg.minGap) || (lo < times.length && times[lo] - t < cfg.minGap)) continue;
            times.splice(lo, 0, t);
            chosen.push(p.o);
        }
        return chosen.sort((a, b) => a.t - b.t);
    }

    /* ---------- 激昂段落：用每 8 秒的起音強度找出最強的幾段 ---------- */
    function loudSegments() {
        const win = 8;
        const bins = [];
        for (let s = 0; s + win <= DURATION; s += win) {
            const sum = ONSETS.filter(o => o.t >= s && o.t < s + win).reduce((a, o) => a + o.str, 0);
            bins.push({ s, sum });
        }
        const sorted = bins.map(b => b.sum).sort((a, b) => a - b);
        const cut = sorted[Math.floor(sorted.length * 0.7)];
        const segs = [];
        bins.forEach(b => {
            if (b.sum < cut || b.s < 16 || b.s + win > DURATION - 12) return;
            const prev = segs[segs.length - 1];
            if (prev && b.s - prev.end <= win) prev.end = b.s + win;
            else segs.push({ start: b.s, end: b.s + win });
        });
        return segs.filter(s => s.end - s.start >= 16);
    }

    const SPLITS = loudSegments();
    const TRANS = 2; // 分線／合線的轉場秒數
    const splitAt = t => SPLITS.some(s => t >= s.start + TRANS && t < s.end - 0.2);
    const inTransition = t => SPLITS.some(s => (t >= s.start - 0.3 && t < s.start + TRANS) || (t >= s.end - 0.2 && t < s.end + TRANS));

    function choreograph(ch) {
        const A = ch.line({ x: 0.5, y: 0.74, speed: 0.9 });
        const B = ch.line({ x: 0.5, y: 0.74, alpha: 0, speed: 0.9 });

        // 一般段落：慢慢左右擺動
        let t = 3;
        let k = 0;
        const busy = time => SPLITS.some(s => time > s.start - 9 && time < s.end + TRANS);
        while (t + 8 < DURATION - 6) {
            if (!busy(t + 8) && !busy(t)) {
                A.move(t, 8, { x: k % 2 ? 0.55 : 0.45, angle: k % 2 ? 4 : -4 }, "inOutSine");
                k++;
            }
            t += 8;
        }

        // 激昂段落：分成兩條線
        SPLITS.forEach(s => {
            A.move(s.start - 1, 1, { x: 0.5, angle: 0 }, "inOutSine");
            A.move(s.start, TRANS, { x: 0.3, len: 0.24 }, "outCubic");
            B.set("x", s.start, 0.5);
            B.set("len", s.start, 0.24);
            B.move(s.start, TRANS, { x: 0.7, alpha: 1 }, "outCubic");
            for (let b = s.start + TRANS, i = 0; b + 4 <= s.end; b += 4, i++) {
                A.to("angle", b, b + 2, i % 2 ? -6 : 6, "inOutSine");
                B.to("angle", b, b + 2, i % 2 ? 6 : -6, "inOutSine");
            }
            A.move(s.end, TRANS, { x: 0.5, angle: 0, len: 4 }, "inOutCubic");
            B.move(s.end, TRANS, { x: 0.5, angle: 0, alpha: 0 }, "inOutCubic");
        });

        A.move(DURATION - 5, 4, { alpha: 0, y: 0.68 }, "inSine");
        return { A, B };
    }

    function buildChart(level) {
        const cfg = LEVEL[level];
        const rand = mulberry32(level.length * 977 + 13);
        const ch = new ChartBuilder({ bpm: 60, offset: 0 });
        const { A, B } = choreograph(ch);
        const notes = pick(cfg);

        // 位置：附近 ±4 秒內的音高排名（高音在右）
        const q = notes.map((n, i) => {
            let below = 0;
            let total = 0;
            for (let j = i - 1; j >= 0 && notes[j].t > n.t - 4; j--) { total++; if (notes[j].pitch < n.pitch) below++; else if (notes[j].pitch === n.pitch) below += 0.5; }
            for (let j = i + 1; j < notes.length && notes[j].t < n.t + 4; j++) { total++; if (notes[j].pitch < n.pitch) below++; else if (notes[j].pitch === n.pitch) below += 0.5; }
            return total ? below / total : 0.5;
        });

        // 長押候選
        const holds = new Map();
        const holdCandidates = [];
        notes.forEach((n, i) => {
            const next = i + 1 < notes.length ? notes[i + 1].t : DURATION;
            const gap = next - n.t;
            if (gap >= cfg.holdGap && n.sus >= 0.55 && !inTransition(n.t)) {
                const len = Math.min(gap - 0.3, 2.4);
                if (len >= 0.45) holdCandidates.push({ i, len, score: len * Math.min(1.3, n.sus) });
            }
        });
        holdCandidates.sort((a, b) => b.score - a.score)
            .slice(0, Math.round(notes.length * cfg.holdRatio))
            .forEach(h => holds.set(h.i, h.len));

        // Flick：前後都有空間的最強重音
        const flicks = new Set();
        notes.map((n, i) => ({ n, i }))
            .filter(({ n, i }) => !holds.has(i) &&
                (i === 0 || n.t - notes[i - 1].t >= 0.4) &&
                (i === notes.length - 1 || notes[i + 1].t - n.t >= 0.4))
            .sort((a, b) => b.n.rel - a.n.rel)
            .slice(0, Math.round(notes.length * cfg.flickRatio))
            .forEach(({ i }) => flicks.add(i));

        let prevPos = 0;
        let prevT = -1;
        notes.forEach((n, i) => {
            const split = splitAt(n.t);
            const trans = inTransition(n.t);
            const range = split ? 0.15 : trans ? 0.12 : 0.3;
            let line = A;
            let qq = q[i];
            if (split) {
                if (qq >= 0.5) { line = B; qq = (qq - 0.5) * 2; } else { qq *= 2; }
            }
            let pos = Math.round((qq * 2 - 1) * range * 100) / 100;

            // 快速連續的音：變成 Drag，位置一步一步移動
            const inRun = cfg.runGap > 0 && n.t - prevT < cfg.runGap;
            if (inRun && !split) {
                const step = Math.max(-0.08, Math.min(0.08, pos - prevPos));
                pos = Math.round((prevPos + (step || (rand() < 0.5 ? -0.06 : 0.06))) * 100) / 100;
                pos = Math.max(-range, Math.min(range, pos));
            }

            if (holds.has(i)) line.hold(n.t, holds.get(i), pos);
            else if (flicks.has(i)) line.flick(n.t, pos);
            else if (inRun) line.drag(n.t, pos);
            else line.tap(n.t, pos);

            prevPos = pos;
            prevT = n.t;
        });

        return ch.build();
    }

    /* ---------- 音檔播放 ---------- */
    let buffer = null;

    async function prepare(ctx, progress) {
        if (buffer) return;
        progress("讀取音樂中……");
        let data;
        try {
            const res = await fetch("assets/audio/theme.mp3");
            if (!res.ok) throw new Error("HTTP " + res.status);
            data = await res.arrayBuffer();
        } catch (err) {
            const e = new Error("讀不到音樂檔。請用網頁伺服器（例如 GitHub Pages）開啟遊戲，不要直接雙擊 html 檔。");
            e.friendly = true;
            throw e;
        }
        progress("解碼音樂中……");
        buffer = await new Promise((resolve, reject) => {
            const p = ctx.decodeAudioData(data, resolve, reject);
            if (p && p.then) p.then(resolve, reject);
        });
    }

    function createPlayer(ctx, out) {
        const gain = ctx.createGain();
        gain.connect(out);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(gain);
        let started = false;
        let stopped = false;
        return {
            start(when) { src.start(when); started = true; },
            pump() {},
            stop(fade) {
                if (stopped) return;
                stopped = true;
                const now = ctx.currentTime;
                const f = fade || 0.08;
                gain.gain.cancelScheduledValues(now);
                gain.gain.setValueAtTime(gain.gain.value, now);
                gain.gain.linearRampToValueAtTime(0, now + f);
                if (started) {
                    try { src.stop(now + f + 0.02); } catch (err) { /* 已停止 */ }
                }
            }
        };
    }

    window.SONGS = window.SONGS || [];
    window.SONGS.push({
        id: "theme",
        title: "心動的每一天",
        subtitle: "Everyday Heartbeat",
        artist: "主題曲",
        bpm: "自由",
        length: "3:27",
        cover: "assets/covers/theme.jpg",
        difficulties: [
            { id: "easy", label: "EASY", level: 2 },
            { id: "normal", label: "NORMAL", level: 6 },
            { id: "hard", label: "HARD", level: 9 }
        ],
        prepare,
        createPlayer,
        buildChart
    });
})();
