/* ==========================================================
   弦光：遊戲引擎
   ----------------------------------------------------------
   - 多條判定線：會移動、旋轉、淡入淡出、改變流速
   - 四種音符
       Tap   ：音符碰到判定線時點擊
       Drag  ：手指停在判定線上，讓音符經過即可
       Hold  ：點擊後按住直到尾端
       Flick ：手指在判定線上往任意方向滑動
   - 多點觸控（同時支援滑鼠）
   - 分數：準度 900,000 + 連擊 100,000
========================================================== */

(function (root) {
    "use strict";

    const { sample } = root.Chart;

    const PENDING = 0;
    const HOLDING = 1;
    const DONE = 2;

    // 判定區間（秒）
    const WIN = {
        perfect: 0.075,
        good: 0.15,
        bad: 0.18,
        drag: 0.12,
        flick: 0.15
    };
    const ACC_WEIGHT = { perfect: 1, good: 0.65, bad: 0, miss: 0 };

    const COLORS = {
        tap: ["#e9fbff", "#56d6ff"],
        hold: ["#e9fbff", "#56d6ff"],
        drag: ["#fff6d6", "#ffc94d"],
        flick: ["#ffe1ea", "#ff5c8a"],
        line: "#fff4e3",
        perfect: "#ffe29a",
        good: "#8fe3ff",
        bad: "#ff7b8f"
    };

    const FONT = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif';

    class Game {
        constructor(opts) {
            this.canvas = opts.canvas;
            this.g = this.canvas.getContext("2d");
            this.audio = opts.audio;
            this.chart = opts.chart;
            this.meta = opts.meta;
            this.settings = opts.settings;
            this.cover = opts.cover;
            this.onFinish = opts.onFinish;
            this.autoplay = !!opts.autoplay;
            this.player = opts.makePlayer(this.audio.ctx);

            this.notes = this.chart.notes;
            this.lines = this.chart.lines;
            this.notes.forEach(n => {
                n.state = PENDING;
                n.result = null;
                n.armed = false;
                n.missed = false;
                n.lastHeld = 0;
                n.doneAt = 0;
                n.nextSpark = 0;
            });
            this.lines.forEach(l => { l.first = 0; });

            this.total = this.notes.length;
            this.counts = { perfect: 0, good: 0, bad: 0, miss: 0 };
            this.judged = 0;
            this.combo = 0;
            this.maxCombo = 0;
            this.comboAt = 0;
            this.offsets = [];
            this.first = 0;
            this.effects = [];
            this.touches = new Map();
            this.taps = [];
            this.paused = false;
            this.finished = false;
            this.clock = { ct: -1, pt: 0, last: -Infinity };
            this.endTime = this.chart.duration + 1.4;

            this.handlers = [];
            this.bindInput();
            this.resize();
        }

        /* ---------- 版面 ---------- */
        resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const W = window.innerWidth;
            const H = window.innerHeight;
            this.canvas.width = Math.round(W * dpr);
            this.canvas.height = Math.round(H * dpr);
            const stageW = Math.min(W, (H * 16) / 9);
            const stageH = Math.min(H, (stageW * 9) / 16);
            const scale = this.settings.noteSize;
            this.view = {
                W, H, dpr,
                sx: (W - stageW) / 2,
                sy: (H - stageH) / 2,
                sw: stageW,
                sh: stageH,
                unit: stageH * 0.78 * (0.4 + 0.12 * this.settings.speed),
                noteW: stageW * 0.1 * scale,
                noteH: Math.max(7, stageH * 0.024) * scale,
                lineW: Math.max(2, stageH * 0.0055),
                reach: Math.hypot(W, H) * 1.1
            };
            this.renderBackground();
        }

        renderBackground() {
            const { W, H, dpr } = this.view;
            const bg = document.createElement("canvas");
            bg.width = Math.round(W * dpr);
            bg.height = Math.round(H * dpr);
            const c = bg.getContext("2d");
            c.fillStyle = "#07070f";
            c.fillRect(0, 0, bg.width, bg.height);
            const img = this.cover;
            if (img && img.naturalWidth) {
                // 先縮到很小再放大，做出便宜又順的模糊效果
                const small = document.createElement("canvas");
                small.width = 48;
                small.height = 27;
                const sc = small.getContext("2d");
                sc.drawImage(img, 0, 0, small.width, small.height);
                const ratio = Math.max(bg.width / img.naturalWidth, bg.height / img.naturalHeight);
                const w = img.naturalWidth * ratio;
                const h = img.naturalHeight * ratio;
                c.imageSmoothingEnabled = true;
                c.imageSmoothingQuality = "high";
                c.globalAlpha = 1;
                c.drawImage(small, (bg.width - w) / 2, (bg.height - h) / 2, w, h);
            }
            const grad = c.createLinearGradient(0, 0, 0, bg.height);
            grad.addColorStop(0, "rgba(6, 6, 14, 0.62)");
            grad.addColorStop(1, "rgba(6, 6, 14, 0.8)");
            c.fillStyle = grad;
            c.fillRect(0, 0, bg.width, bg.height);
            this.background = bg;
        }

        /* ---------- 時鐘 ---------- */
        now() {
            const ctx = this.audio.ctx;
            const ct = ctx.currentTime;
            const pt = performance.now();
            const c = this.clock;
            if (ct !== c.ct) { c.ct = ct; c.pt = pt; }
            let t = ct;
            if (ctx.state === "running" && !this.paused) t += Math.min((pt - c.pt) / 1000, 0.05);
            const lat = typeof ctx.outputLatency === "number" && ctx.outputLatency > 0 && ctx.outputLatency < 0.5
                ? ctx.outputLatency
                : ctx.baseLatency || 0;
            t = t - lat - this.startAt - this.settings.offset / 1000;
            if (t < c.last && c.last - t < 0.05) t = c.last;
            c.last = t;
            return t;
        }

        eventTime(e) {
            const t = this.now();
            const lag = (performance.now() - e.timeStamp) / 1000;
            return lag > 0 && lag < 0.1 ? t - lag : t;
        }

        /* ---------- 開始／暫停 ---------- */
        start() {
            const ctx = this.audio.ctx;
            const leadIn = 1.6;
            this.startAt = ctx.currentTime + leadIn;
            this.player.start(this.startAt);
            this.loop = this.loop.bind(this);
            requestAnimationFrame(this.loop);
        }

        pause() {
            if (this.paused || this.finished) return;
            this.paused = true;
            this.audio.ctx.suspend();
            this.touches.clear();
            this.taps.length = 0;
        }

        resume() {
            if (!this.paused || this.finished) return;
            const t = this.clock.last;
            // 回來後給長押一點時間重新按住
            this.notes.forEach(n => { if (n.state === HOLDING) n.lastHeld = t + 0.4; });
            this.paused = false;
            this.audio.ctx.resume();
        }

        destroy() {
            this.finished = true;
            this.player.stop();
            this.handlers.forEach(([el, type, fn, opt]) => el.removeEventListener(type, fn, opt));
            this.handlers = [];
            const g = this.g;
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }

        /* ---------- 輸入 ---------- */
        on(el, type, fn, opt) {
            el.addEventListener(type, fn, opt);
            this.handlers.push([el, type, fn, opt]);
        }

        bindInput() {
            const cv = this.canvas;
            const flickSpeed = () => Math.max(500, this.view.sh * 1.9);

            this.on(cv, "pointerdown", e => {
                if (this.paused || this.finished) return;
                e.preventDefault();
                try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 舊瀏覽器 */ }
                const t = this.eventTime(e);
                this.touches.set(e.pointerId, {
                    x: e.clientX, y: e.clientY,
                    pt: e.timeStamp, vx: 0, vy: 0,
                    flickReady: true, flickAt: -Infinity
                });
                this.taps.push({ x: e.clientX, y: e.clientY, t });
            }, { passive: false });

            this.on(cv, "pointermove", e => {
                const tc = this.touches.get(e.pointerId);
                if (!tc) return;
                const dt = (e.timeStamp - tc.pt) / 1000;
                const dx = e.clientX - tc.x;
                const dy = e.clientY - tc.y;
                tc.x = e.clientX;
                tc.y = e.clientY;
                tc.pt = e.timeStamp;
                if (dt <= 0) return;
                const vx = dx / dt;
                const vy = dy / dt;
                // 稍微平滑速度，避免單一事件的雜訊
                tc.vx = tc.vx * 0.3 + vx * 0.7;
                tc.vy = tc.vy * 0.3 + vy * 0.7;
                const speed = Math.hypot(tc.vx, tc.vy);
                const th = flickSpeed();
                if (speed > th) {
                    if (!tc.flickReady && tc.dir && (tc.vx * tc.dir[0] + tc.vy * tc.dir[1]) < 0) tc.flickReady = true;
                    tc.flickAt = this.eventTime(e);
                    tc.dir = [tc.vx / speed, tc.vy / speed];
                } else if (speed < th * 0.45) {
                    // 停下來或慢下來之後，可以再滑一次
                    tc.flickReady = true;
                }
            });

            const up = e => { this.touches.delete(e.pointerId); };
            this.on(cv, "pointerup", up);
            this.on(cv, "pointercancel", up);
            this.on(cv, "contextmenu", e => e.preventDefault());
        }

        /* ---------- 幾何 ---------- */
        updateLines(t) {
            const v = this.view;
            for (const l of this.lines) {
                const tr = l.tracks;
                const ang = (sample(tr.angle, t) * Math.PI) / 180;
                l.cx = v.sx + sample(tr.x, t) * v.sw;
                l.cy = v.sy + sample(tr.y, t) * v.sh;
                l.cos = Math.cos(ang);
                l.sin = Math.sin(ang);
                l.ang = ang;
                l.alpha = Math.max(0, Math.min(1, sample(tr.alpha, t)));
                l.len = Math.min(v.reach, sample(tr.len, t) * v.sw);
                l.floorNow = l.floorAt(t);
            }
        }

        // 觸控點是否在音符的判定範圍內（沿著判定線的方向比較）
        inRange(n, x, y) {
            const l = n.line;
            const v = this.view;
            const along = (x - l.cx) * l.cos + (y - l.cy) * l.sin;
            const target = n.pos * v.sw;
            return Math.abs(along - target) <= v.noteW * 0.5 + v.sw * 0.04;
        }

        perpDistance(n, x, y) {
            const l = n.line;
            return Math.abs((x - l.cx) * l.sin - (y - l.cy) * l.cos);
        }

        notePoint(n) {
            const l = n.line;
            const a = n.pos * this.view.sw;
            return { x: l.cx + l.cos * a, y: l.cy + l.sin * a };
        }

        /* ---------- 判定 ---------- */
        record(n, kind, dt) {
            this.counts[kind]++;
            this.judged++;
            if (kind === "miss" || kind === "bad") {
                this.combo = 0;
            } else {
                this.combo++;
                this.comboAt = performance.now();
                if (this.combo > this.maxCombo) this.maxCombo = this.combo;
            }
            if (dt !== null && dt !== undefined && kind !== "miss") this.offsets.push(dt);
            if (kind !== "miss") this.spawnHit(n, kind);
        }

        processTaps() {
            const notes = this.notes;
            for (const tap of this.taps) {
                let best = null;
                let bestScore = Infinity;
                for (let i = this.first; i < notes.length; i++) {
                    const n = notes[i];
                    if (n.t > tap.t + WIN.bad) break;
                    if (n.state !== PENDING || (n.type !== "tap" && n.type !== "hold")) continue;
                    const dt = tap.t - n.t;
                    const limit = n.type === "hold" ? WIN.good : WIN.bad;
                    if (Math.abs(dt) > limit) continue;
                    if (!this.inRange(n, tap.x, tap.y)) continue;
                    // 時間最接近的優先；時間相同時選比較靠近的判定線
                    const score = Math.abs(dt) * 1000 + this.perpDistance(n, tap.x, tap.y) * 0.01;
                    if (score < bestScore) { bestScore = score; best = n; }
                }
                if (!best) continue;
                const dt = tap.t - best.t;
                const a = Math.abs(dt);
                const kind = a <= WIN.perfect ? "perfect" : a <= WIN.good ? "good" : "bad";
                if (best.type === "tap") {
                    best.state = DONE;
                    best.result = kind;
                    best.doneAt = tap.t;
                    this.record(best, kind, dt);
                    this.sound(kind === "bad" ? "soft" : "tap");
                } else {
                    best.state = HOLDING;
                    best.result = kind;
                    best.lastHeld = tap.t;
                    this.spawnHit(best, kind);
                    this.offsets.push(dt);
                    this.sound("tap");
                }
            }
            this.taps.length = 0;
        }

        touchInRange(n) {
            for (const tc of this.touches.values()) {
                if (this.inRange(n, tc.x, tc.y)) return tc;
            }
            return null;
        }

        updateNotes(t) {
            const notes = this.notes;
            for (let i = this.first; i < notes.length; i++) {
                const n = notes[i];
                if (n.t > t + 0.3) break;
                if (n.state === DONE) continue;

                if (this.autoplay) {
                    if (n.state === PENDING && t >= n.t) {
                        if (n.type === "hold") {
                            n.state = HOLDING;
                            n.result = "perfect";
                            this.spawnHit(n, "perfect");
                        } else {
                            n.state = DONE;
                            n.result = "perfect";
                            this.record(n, "perfect", 0);
                        }
                        this.sound(n.type === "drag" ? "drag" : n.type === "flick" ? "flick" : "tap");
                    }
                    if (n.state === HOLDING) {
                        if (t >= n.end) this.finishHold(n);
                        else this.holdSpark(n, t);
                    }
                    continue;
                }

                switch (n.type) {
                    case "tap":
                        if (t - n.t > WIN.bad) this.miss(n);
                        break;

                    case "drag":
                        if (!n.armed && Math.abs(t - n.t) <= WIN.drag && this.touchInRange(n)) n.armed = true;
                        if (n.armed && t >= n.t) {
                            n.state = DONE;
                            n.result = "perfect";
                            this.record(n, "perfect", null);
                            this.sound("drag");
                        } else if (!n.armed && t - n.t > WIN.drag) {
                            this.miss(n);
                        }
                        break;

                    case "flick":
                        if (!n.armed && Math.abs(t - n.t) <= WIN.flick) {
                            for (const tc of this.touches.values()) {
                                if (tc.flickReady && t - tc.flickAt < 0.08 && this.inRange(n, tc.x, tc.y)) {
                                    tc.flickReady = false;
                                    n.armed = true;
                                    break;
                                }
                            }
                        }
                        if (n.armed && t >= n.t) {
                            n.state = DONE;
                            n.result = "perfect";
                            this.record(n, "perfect", null);
                            this.sound("flick");
                        } else if (!n.armed && t - n.t > WIN.flick) {
                            this.miss(n);
                        }
                        break;

                    case "hold":
                        if (n.state === PENDING) {
                            if (t - n.t > WIN.good) this.miss(n);
                        } else {
                            if (this.touchInRange(n)) n.lastHeld = t;
                            if (t >= n.end) {
                                this.finishHold(n);
                            } else if (t - n.lastHeld > 0.12) {
                                if (t > n.end - 0.15) this.finishHold(n);
                                else this.miss(n);
                            } else {
                                this.holdSpark(n, t);
                            }
                        }
                        break;
                }
            }
            while (this.first < notes.length && notes[this.first].state === DONE) this.first++;
        }

        finishHold(n) {
            n.state = DONE;
            n.doneAt = n.end;
            // 長押在尾端結算，判定沿用按下時的結果
            this.record(n, n.result === "bad" ? "good" : n.result, null);
        }

        miss(n) {
            n.state = DONE;
            n.missed = true;
            n.result = "miss";
            n.doneAt = this.clock.last;
            this.record(n, "miss", null);
        }

        holdSpark(n, t) {
            if (t < n.nextSpark) return;
            n.nextSpark = t + 0.12;
            const p = this.notePoint(n);
            this.effects.push({ x: p.x, y: p.y, ang: n.line.ang, color: COLORS[n.result] || COLORS.perfect, at: performance.now(), small: true });
        }

        spawnHit(n, kind) {
            const p = this.notePoint(n);
            const parts = [];
            const count = kind === "bad" ? 0 : 6;
            for (let i = 0; i < count; i++) {
                const a = Math.random() * Math.PI * 2;
                const s = 0.6 + Math.random() * 0.8;
                parts.push({ dx: Math.cos(a) * s, dy: Math.sin(a) * s, r: Math.random() });
            }
            this.effects.push({ x: p.x, y: p.y, ang: n.line.ang, color: COLORS[kind], at: performance.now(), parts });
            if (this.effects.length > 80) this.effects.splice(0, this.effects.length - 80);
        }

        /* ---------- 音效 ---------- */
        sound(kind) {
            if (this.settings.sfx <= 0) return;
            const ctx = this.audio.ctx;
            const t = ctx.currentTime;
            const out = this.audio.sfx;
            const g = ctx.createGain();
            g.connect(out);
            if (kind === "flick") {
                const src = ctx.createBufferSource();
                src.buffer = this.audio.noise;
                const bp = ctx.createBiquadFilter();
                bp.type = "bandpass";
                bp.Q.value = 1.4;
                bp.frequency.setValueAtTime(1800, t);
                bp.frequency.exponentialRampToValueAtTime(6500, t + 0.09);
                g.gain.setValueAtTime(0.0001, t);
                g.gain.linearRampToValueAtTime(0.5, t + 0.01);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                src.connect(bp).connect(g);
                src.start(t);
                src.stop(t + 0.13);
                return;
            }
            const o = ctx.createOscillator();
            o.type = kind === "drag" ? "sine" : "triangle";
            const f = kind === "drag" ? 1760 : kind === "soft" ? 700 : 1240;
            o.frequency.setValueAtTime(f, t);
            o.frequency.exponentialRampToValueAtTime(f * 0.66, t + 0.05);
            const lvl = kind === "drag" ? 0.1 : kind === "soft" ? 0.1 : 0.2;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(lvl, t + 0.002);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
            o.connect(g);
            o.start(t);
            o.stop(t + 0.08);
        }

        /* ---------- 主迴圈 ---------- */
        loop() {
            if (this.finished) return;
            this.player.pump();
            const t = this.now();
            this.updateLines(t);
            if (!this.paused) {
                this.processTaps();
                this.updateNotes(t);
            }
            this.draw(t);
            if (!this.paused && t >= this.endTime) {
                this.finish();
                return;
            }
            requestAnimationFrame(this.loop);
        }

        score() {
            if (!this.total) return 0;
            const acc = (this.counts.perfect + this.counts.good * 0.65) / this.total;
            return Math.round(acc * 900000 + (this.maxCombo / this.total) * 100000);
        }

        accuracy() {
            if (!this.judged) return 100;
            const sum = this.counts.perfect * ACC_WEIGHT.perfect + this.counts.good * ACC_WEIGHT.good;
            return (sum / this.judged) * 100;
        }

        finish() {
            if (this.finished) return;
            const result = {
                score: this.score(),
                accuracy: this.total ? ((this.counts.perfect + this.counts.good * 0.65) / this.total) * 100 : 0,
                counts: Object.assign({}, this.counts),
                maxCombo: this.maxCombo,
                total: this.total,
                offsets: this.offsets.slice(),
                autoplay: this.autoplay
            };
            this.player.stop(0.6);
            this.finished = true;
            this.handlers.forEach(([el, type, fn, opt]) => el.removeEventListener(type, fn, opt));
            this.handlers = [];
            this.onFinish(result);
        }

        /* ==========================================================
           繪圖
        ========================================================== */
        draw(t) {
            const g = this.g;
            const v = this.view;
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.drawImage(this.background, 0, 0);
            g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);

            // 判定線
            for (const l of this.lines) {
                if (l.alpha <= 0.003) continue;
                g.save();
                g.translate(l.cx, l.cy);
                g.rotate(l.ang);
                g.globalAlpha = l.alpha;
                g.shadowColor = "rgba(255, 220, 170, 0.9)";
                g.shadowBlur = 10;
                if (l.len >= v.reach) {
                    g.fillStyle = COLORS.line;
                } else {
                    // 有長度的判定線：兩端淡出
                    const grad = g.createLinearGradient(-l.len, 0, l.len, 0);
                    grad.addColorStop(0, "rgba(255, 244, 227, 0)");
                    grad.addColorStop(0.18, COLORS.line);
                    grad.addColorStop(0.82, COLORS.line);
                    grad.addColorStop(1, "rgba(255, 244, 227, 0)");
                    g.fillStyle = grad;
                }
                g.fillRect(-l.len, -v.lineW / 2, l.len * 2, v.lineW);
                g.restore();
            }

            // 音符：先畫長押，再畫一般音符
            this.drawNotes(t, true);
            this.drawNotes(t, false);
            this.drawEffects();
            this.drawTexts(t);
            this.drawHud(t);
        }

        drawNotes(t, holdsPass) {
            const v = this.view;
            const g = this.g;
            const maxFloor = v.reach / (v.unit * 0.5);
            for (const l of this.lines) {
                const list = l.notes;
                // 往前推進：已結束而且早就離開畫面的音符不用再看
                while (l.first < list.length) {
                    const n = list[l.first];
                    if (n.state === DONE && (!n.missed || t - n.doneAt > 0.5) && n.end < t) l.first++;
                    else break;
                }
                for (let i = l.first; i < list.length; i++) {
                    const n = list[i];
                    if (n.floor - l.floorNow > maxFloor) break;
                    if ((n.type === "hold") !== holdsPass) continue;
                    if (n.state === DONE && !n.missed) continue;
                    let dist = (n.floor - l.floorNow) * n.speed * v.unit;
                    if (n.state === HOLDING) dist = 0;
                    if (n.missed) {
                        if (t - n.doneAt > 0.35) continue;
                    } else if (n.type !== "hold" && dist < -v.noteH * 2) {
                        continue;
                    }
                    if (dist > v.reach) continue;

                    const along = n.pos * v.sw;
                    g.save();
                    g.translate(l.cx + l.cos * along, l.cy + l.sin * along);
                    g.rotate(l.ang);
                    g.globalAlpha = n.missed ? Math.max(0, 0.45 - (t - n.doneAt)) : 1;
                    const y = -dist * n.side;
                    if (n.type === "hold") {
                        const tail = (n.floorEnd - l.floorNow) * n.speed * v.unit;
                        this.drawHold(g, y, -tail * n.side, n);
                    } else {
                        this.drawHead(g, y, n);
                    }
                    g.restore();
                }
            }
        }

        drawHead(g, y, n) {
            const v = this.view;
            const w = n.type === "drag" ? v.noteW * 0.92 : v.noteW;
            const h = n.type === "drag" ? v.noteH * 0.6 : v.noteH;
            const [light, deep] = COLORS[n.type];
            const x = -w / 2;
            const top = y - h / 2;

            if (n.multi) {
                g.fillStyle = "rgba(255, 255, 255, 0.85)";
                roundRect(g, x - 3, top - 3, w + 6, h + 6, h / 2 + 3);
                g.fill();
            }
            const grad = g.createLinearGradient(0, top, 0, top + h);
            grad.addColorStop(0, light);
            grad.addColorStop(1, deep);
            g.fillStyle = grad;
            roundRect(g, x, top, w, h, h / 2);
            g.fill();

            if (n.type === "tap") {
                g.fillStyle = "rgba(255, 255, 255, 0.95)";
                g.fillRect(-w * 0.3, y - 1, w * 0.6, 2);
            } else if (n.type === "drag") {
                g.fillStyle = "rgba(255, 255, 255, 0.95)";
                g.beginPath();
                g.moveTo(0, y - h * 0.9);
                g.lineTo(h * 0.9, y);
                g.lineTo(0, y + h * 0.9);
                g.lineTo(-h * 0.9, y);
                g.closePath();
                g.fill();
            } else if (n.type === "flick") {
                // 兩端的箭頭：提示要滑動
                g.strokeStyle = "rgba(255, 255, 255, 0.95)";
                g.lineWidth = Math.max(1.5, h * 0.18);
                g.lineCap = "round";
                g.lineJoin = "round";
                const s = h * 0.55;
                [-1, 1].forEach(side => {
                    const cx = side * w * 0.28;
                    g.beginPath();
                    g.moveTo(cx - s, y + s * 0.45);
                    g.lineTo(cx, y - s * 0.45);
                    g.lineTo(cx + s, y + s * 0.45);
                    g.stroke();
                });
            }
        }

        drawHold(g, headY, tailY, n) {
            const v = this.view;
            const w = v.noteW * 0.78;
            const top = Math.min(headY, tailY);
            const bottom = Math.max(headY, tailY);
            if (bottom - top > 1) {
                const holding = n.state === HOLDING;
                const grad = g.createLinearGradient(0, tailY, 0, headY);
                grad.addColorStop(0, "rgba(86, 214, 255, 0.15)");
                grad.addColorStop(1, holding ? "rgba(190, 240, 255, 0.85)" : "rgba(86, 214, 255, 0.6)");
                g.fillStyle = grad;
                g.fillRect(-w / 2, top, w, bottom - top);
                g.fillStyle = holding ? "rgba(255, 255, 255, 0.95)" : "rgba(200, 245, 255, 0.8)";
                g.fillRect(-w / 2, top, 2, bottom - top);
                g.fillRect(w / 2 - 2, top, 2, bottom - top);
                // 尾端
                g.fillStyle = "rgba(233, 251, 255, 0.95)";
                g.fillRect(-w / 2, tailY - 1.5, w, 3);
            }
            if (n.state !== HOLDING) this.drawHead(g, headY, n);
        }

        drawEffects() {
            const g = this.g;
            const v = this.view;
            const now = performance.now();
            const life = 420;
            this.effects = this.effects.filter(e => now - e.at < life);
            for (const e of this.effects) {
                const p = (now - e.at) / life;
                g.save();
                g.translate(e.x, e.y);
                g.rotate(e.ang);
                if (e.small) {
                    const q = Math.min(1, p * 2.2);
                    g.globalAlpha = 1 - q;
                    g.strokeStyle = e.color;
                    g.lineWidth = 2;
                    g.beginPath();
                    g.arc(0, 0, v.noteW * (0.15 + 0.25 * q), 0, Math.PI * 2);
                    g.stroke();
                    g.restore();
                    continue;
                }
                const ease = 1 - Math.pow(1 - p, 3);
                g.globalAlpha = 1 - p;
                // 光環
                g.strokeStyle = e.color;
                g.lineWidth = 3 * (1 - p) + 1;
                g.beginPath();
                g.arc(0, 0, v.noteW * (0.2 + 0.5 * ease), 0, Math.PI * 2);
                g.stroke();
                // 垂直光柱
                const beam = g.createLinearGradient(0, 0, 0, -v.sh * 0.22);
                beam.addColorStop(0, e.color);
                beam.addColorStop(1, "rgba(255,255,255,0)");
                g.fillStyle = beam;
                g.globalAlpha = (1 - p) * 0.55;
                const bw = v.noteW * 0.5 * (1 - p);
                g.fillRect(-bw / 2, -v.sh * 0.22, bw, v.sh * 0.22);
                // 碎光
                g.globalAlpha = 1 - p;
                g.fillStyle = e.color;
                if (e.parts) {
                    for (const s of e.parts) {
                        const d = v.noteW * (0.25 + 0.8 * ease * s.dx * s.dx + 0.8 * ease * s.dy * s.dy);
                        const px = s.dx * d;
                        const py = s.dy * d;
                        const size = (3 + s.r * 3) * (1 - p);
                        g.beginPath();
                        g.moveTo(px, py - size);
                        g.lineTo(px + size, py);
                        g.lineTo(px, py + size);
                        g.lineTo(px - size, py);
                        g.closePath();
                        g.fill();
                    }
                }
                g.restore();
            }
            g.globalAlpha = 1;
        }

        drawTexts(t) {
            const texts = this.chart.texts;
            if (!texts.length) return;
            const g = this.g;
            const v = this.view;
            for (const x of texts) {
                if (t < x.start - 0.3 || t > x.end + 0.3) continue;
                const a = Math.min(1, (t - x.start + 0.3) / 0.3, (x.end + 0.3 - t) / 0.3);
                g.globalAlpha = Math.max(0, a);
                g.textAlign = "center";
                g.textBaseline = "middle";
                const lines = x.message.split("\n");
                lines.forEach((line, i) => {
                    g.font = (i === 0 ? "700 " : "400 ") + Math.round(v.sh * (i === 0 ? 0.052 : 0.036)) + "px " + FONT;
                    g.fillStyle = i === 0 ? "#ffffff" : "rgba(255,255,255,0.78)";
                    g.fillText(line, v.W / 2, v.sy + v.sh * 0.22 + i * v.sh * 0.07);
                });
                g.globalAlpha = 1;
            }
        }

        drawHud(t) {
            const g = this.g;
            const v = this.view;
            const pad = Math.max(14, v.sh * 0.035);

            // 進度條
            const progress = Math.max(0, Math.min(1, t / this.chart.duration));
            g.fillStyle = "rgba(255,255,255,0.12)";
            g.fillRect(0, 0, v.W, 3);
            const pg = g.createLinearGradient(0, 0, v.W, 0);
            pg.addColorStop(0, "#56d6ff");
            pg.addColorStop(1, "#ff5c8a");
            g.fillStyle = pg;
            g.fillRect(0, 0, v.W * progress, 3);

            // 分數
            g.textBaseline = "top";
            g.textAlign = "right";
            g.fillStyle = "#ffffff";
            g.font = "600 " + Math.round(v.sh * 0.06) + "px " + FONT;
            g.fillText(String(this.score()).padStart(7, "0"), v.W - pad, pad * 0.8);

            const c = this.counts;
            let status = "";
            if (this.judged > 0 && c.miss === 0 && c.bad === 0) status = c.good === 0 ? "ALL PERFECT" : "FULL COMBO";
            if (status) {
                g.font = "600 " + Math.round(v.sh * 0.026) + "px " + FONT;
                g.fillStyle = status === "ALL PERFECT" ? COLORS.perfect : COLORS.good;
                g.fillText(status, v.W - pad, pad * 0.8 + v.sh * 0.075);
            }

            // 連擊
            if (this.combo >= 3) {
                const pop = Math.max(0, 1 - (performance.now() - this.comboAt) / 140);
                g.textAlign = "center";
                g.fillStyle = "#ffffff";
                g.font = "700 " + Math.round(v.sh * (0.07 + pop * 0.012)) + "px " + FONT;
                g.fillText(String(this.combo), v.W / 2, pad * 0.6);
                g.font = "600 " + Math.round(v.sh * 0.024) + "px " + FONT;
                g.fillStyle = "rgba(255,255,255,0.7)";
                g.fillText(this.autoplay ? "AUTOPLAY" : "COMBO", v.W / 2, pad * 0.6 + v.sh * 0.085);
            }

            // 曲名與難度
            g.textBaseline = "bottom";
            g.textAlign = "left";
            g.font = "600 " + Math.round(v.sh * 0.034) + "px " + FONT;
            g.fillStyle = "rgba(255,255,255,0.85)";
            g.fillText(this.meta.title, pad, v.H - pad * 0.7);
            g.textAlign = "right";
            g.fillText(this.meta.difficulty, v.W - pad, v.H - pad * 0.7);
        }
    }

    function roundRect(g, x, y, w, h, r) {
        const rr = Math.min(r, h / 2, w / 2);
        g.beginPath();
        g.moveTo(x + rr, y);
        g.arcTo(x + w, y, x + w, y + h, rr);
        g.arcTo(x + w, y + h, x, y + h, rr);
        g.arcTo(x, y + h, x, y, rr);
        g.arcTo(x, y, x + w, y, rr);
        g.closePath();
    }

    root.Game = Game;
    root.Game.WIN = WIN;
})(window);
