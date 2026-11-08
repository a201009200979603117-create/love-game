/* ==========================================================
   弦光：譜面模型
   ----------------------------------------------------------
   - Ease：緩動函式
   - Track：關鍵影格軌道（判定線的位置、角度、透明度）
   - ChartBuilder：用程式「寫譜」的工具
   - 編譯後的譜面會把拍子換成秒，並預先算好每個音符的 floor 位置

   座標系統（舞台 = 畫面中央 16:9 的區域）
   - 判定線 x、y：0～1（舞台寬、高的比例）；len：半長，以舞台寬度為單位
   - 角度：度，順時針為正；0 度是水平線
   - 音符 pos：沿著判定線的位置，以舞台寬度為單位，0 為中心
   - 音符 side：1 從線的上方（法線方向）落下，-1 從下方
========================================================== */

(function (root) {
    "use strict";

    const PI = Math.PI;

    const Ease = {
        linear: p => p,
        step: p => (p >= 1 ? 1 : 0),
        inSine: p => 1 - Math.cos((p * PI) / 2),
        outSine: p => Math.sin((p * PI) / 2),
        inOutSine: p => -(Math.cos(PI * p) - 1) / 2,
        inQuad: p => p * p,
        outQuad: p => 1 - (1 - p) * (1 - p),
        inOutQuad: p => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
        inCubic: p => p * p * p,
        outCubic: p => 1 - Math.pow(1 - p, 3),
        inOutCubic: p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
        inExpo: p => (p === 0 ? 0 : Math.pow(2, 10 * p - 10)),
        outExpo: p => (p === 1 ? 1 : 1 - Math.pow(2, -10 * p)),
        outBack: p => {
            const c1 = 1.70158;
            const c3 = c1 + 1;
            return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
        },
        inOutBack: p => {
            const c2 = 1.70158 * 1.525;
            return p < 0.5
                ? (Math.pow(2 * p, 2) * ((c2 + 1) * 2 * p - c2)) / 2
                : (Math.pow(2 * p - 2, 2) * ((c2 + 1) * (p * 2 - 2) + c2) + 2) / 2;
        },
        outElastic: p => {
            if (p === 0 || p === 1) return p;
            return Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * ((2 * PI) / 3)) + 1;
        }
    };

    /* ---------- 關鍵影格軌道 ---------- */
    class Track {
        constructor(initial) {
            this.keys = [{ b: -1e9, v: initial, e: "linear" }];
        }

        // 第一個 b <= beat 的關鍵影格索引（同一拍有多個時取最後一個）
        indexAt(beat) {
            const k = this.keys;
            let lo = 0;
            let hi = k.length - 1;
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1;
                if (k[mid].b <= beat) lo = mid; else hi = mid - 1;
            }
            return lo;
        }

        valueAt(beat) {
            const k = this.keys;
            const i = this.indexAt(beat);
            const a = k[i];
            const b = k[i + 1];
            if (!b) return a.v;
            const p = (beat - a.b) / (b.b - a.b);
            return a.v + (b.v - a.v) * Ease[b.e](p);
        }

        insert(key) {
            const k = this.keys;
            let i = k.length;
            while (i > 0 && k[i - 1].b > key.b) i--;
            k.splice(i, 0, key);
        }

        // 從 start 拍開始，在 end 拍時變成 value
        to(start, end, value, ease) {
            const from = this.valueAt(start);
            this.insert({ b: start, v: from, e: "linear" });
            this.insert({ b: end, v: value, e: ease || "linear" });
        }

        // 在 beat 拍瞬間變成 value
        set(beat, value) {
            const from = this.valueAt(beat);
            this.insert({ b: beat, v: from, e: "linear" });
            this.insert({ b: beat, v: value, e: "linear" });
        }
    }

    /* ---------- 寫譜工具 ---------- */
    class LineBuilder {
        constructor(chart, init) {
            this.chart = chart;
            this.tracks = {
                x: new Track(init.x !== undefined ? init.x : 0.5),
                y: new Track(init.y !== undefined ? init.y : 0.72),
                angle: new Track(init.angle || 0),
                alpha: new Track(init.alpha !== undefined ? init.alpha : 1),
                // 判定線的半長（舞台寬度為單位）；預設很長，等於橫跨整個畫面
                len: new Track(init.len !== undefined ? init.len : 4)
            };
            this.speeds = [{ b: -1e9, v: init.speed !== undefined ? init.speed : 1 }];
            this.notes = [];
        }

        to(prop, start, end, value, ease) {
            this.tracks[prop].to(start, end, value, ease);
            return this;
        }

        // 一次移動多個屬性：line.move(16, 4, { x: 0.3, angle: 15 }, "outCubic")
        move(start, length, props, ease) {
            Object.keys(props).forEach(p => this.tracks[p].to(start, start + length, props[p], ease));
            return this;
        }

        set(prop, beat, value) {
            this.tracks[prop].set(beat, value);
            return this;
        }

        value(prop, beat) {
            return this.tracks[prop].valueAt(beat);
        }

        // 音符流速（從 beat 開始生效）
        speed(beat, value) {
            this.speeds.push({ b: beat, v: value });
            this.speeds.sort((a, b) => a.b - b.b);
            return this;
        }

        note(type, beat, pos, opts) {
            const o = opts || {};
            this.notes.push({
                type,
                beat,
                len: o.len || 0,
                pos: pos || 0,
                side: o.side || 1,
                speed: o.speed || 1
            });
            return this;
        }

        tap(beat, pos, opts) { return this.note("tap", beat, pos, opts); }
        drag(beat, pos, opts) { return this.note("drag", beat, pos, opts); }
        flick(beat, pos, opts) { return this.note("flick", beat, pos, opts); }
        hold(beat, len, pos, opts) { return this.note("hold", beat, pos, Object.assign({}, opts, { len })); }
    }

    class ChartBuilder {
        constructor(opts) {
            this.bpm = opts.bpm;
            this.offset = opts.offset || 0;  // 第 0 拍在音樂中的秒數
            this.lines = [];
            this.texts = [];
        }

        line(init) {
            const l = new LineBuilder(this, init || {});
            this.lines.push(l);
            return l;
        }

        // 教學提示文字
        text(start, end, message) {
            this.texts.push({ start, end, message });
            return this;
        }

        sec(beat) {
            return this.offset + (beat * 60) / this.bpm;
        }

        build() {
            const sec = b => this.sec(b);
            const lines = this.lines.map((lb, li) => {
                const tracks = {};
                Object.keys(lb.tracks).forEach(name => {
                    const keys = lb.tracks[name].keys;
                    tracks[name] = {
                        t: keys.map(k => (k.b <= -1e8 ? -1e9 : sec(k.b))),
                        v: keys.map(k => k.v),
                        e: keys.map(k => Ease[k.e] || Ease.linear)
                    };
                });

                // 流速的積分（floor position）：音符和判定線的距離 = floor 差 × 流速
                // 第一段從 -10 秒開始（遊戲開始前的預備時間不會超過這個長度）
                const sp = lb.speeds.filter((s, i, arr) => i === arr.length - 1 || arr[i + 1].b !== s.b);
                const segs = [];
                let f = 0;
                for (let i = 0; i < sp.length; i++) {
                    const start = i === 0 ? -10 : sec(sp[i].b);
                    segs.push({ start, v: sp[i].v, f });
                    if (i + 1 < sp.length) f += (sec(sp[i + 1].b) - start) * sp[i].v;
                }
                const floorAt = t => {
                    let lo = 0;
                    let hi = segs.length - 1;
                    while (lo < hi) {
                        const mid = (lo + hi + 1) >> 1;
                        if (segs[mid].start <= t) lo = mid; else hi = mid - 1;
                    }
                    const s = segs[lo];
                    return s.f + (t - s.start) * s.v;
                };

                const line = { index: li, tracks, floorAt, notes: [] };
                line.notes = lb.notes.map(n => {
                    const t = sec(n.beat);
                    const end = sec(n.beat + n.len);
                    return {
                        type: n.type,
                        t,
                        end,
                        pos: n.pos,
                        side: n.side,
                        speed: n.speed,
                        floor: floorAt(t),
                        floorEnd: floorAt(end),
                        line
                    };
                });
                line.notes.sort((a, b) => a.t - b.t);
                return line;
            });

            const notes = [];
            lines.forEach(l => l.notes.forEach(n => notes.push(n)));
            notes.sort((a, b) => a.t - b.t);

            // 同時出現的音符（多押）會加上外框提示
            for (let i = 0; i < notes.length; i++) {
                for (let j = i + 1; j < notes.length && notes[j].t - notes[i].t < 0.001; j++) {
                    notes[i].multi = true;
                    notes[j].multi = true;
                }
            }

            return {
                bpm: this.bpm,
                lines,
                notes,
                texts: this.texts.map(x => ({ start: sec(x.start), end: sec(x.end), message: x.message })),
                duration: notes.length ? Math.max.apply(null, notes.map(n => n.end)) : 0
            };
        }
    }

    // 執行期：取得軌道在 t 秒時的值
    function sample(track, t) {
        const T = track.t;
        let lo = 0;
        let hi = T.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (T[mid] <= t) lo = mid; else hi = mid - 1;
        }
        const v = track.v;
        if (lo + 1 >= T.length) return v[lo];
        const p = (t - T[lo]) / (T[lo + 1] - T[lo]);
        return v[lo] + (v[lo + 1] - v[lo]) * track.e[lo + 1](p);
    }

    // 可重現的亂數
    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const api = { Ease, Track, ChartBuilder, sample, mulberry32 };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.Chart = api;
})(typeof window !== "undefined" ? window : globalThis);
