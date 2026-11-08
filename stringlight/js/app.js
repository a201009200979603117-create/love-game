/* ==========================================================
   弦光：介面流程
   標題 → 選曲 → 遊戲 → 結算，以及設定、暫停、說明
========================================================== */

(function () {
    "use strict";

    const $ = id => document.getElementById(id);
    const SONGS = window.SONGS;

    /* ---------- 儲存 ---------- */
    const SETTINGS_KEY = "stringlight.settings";
    const BEST_KEY = "stringlight.best";
    const LAST_KEY = "stringlight.last";

    function read(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (err) {
            return fallback;
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (err) {
            /* 無痕模式等情況無法儲存 */
        }
    }

    const DEFAULTS = {
        speed: 5, noteSize: 1, offset: 0,
        bgBright: 40, fcap: true, multiHint: true, earlyLate: true, lowRes: false,
        music: 80, sfx: 60, ui: 50
    };
    const settings = Object.assign({}, DEFAULTS, read(SETTINGS_KEY, {}), { autoplay: false });

    function saveSettings() {
        const copy = Object.assign({}, settings);
        delete copy.autoplay;
        write(SETTINGS_KEY, copy);
    }

    const last = read(LAST_KEY, {});
    const state = {
        song: Math.max(0, SONGS.findIndex(s => s.id === last.song)),
        diff: last.diff || "normal",
        audio: null,
        game: null,
        lastRun: null
    };
    // 確保選到的難度存在（例如「新手教學」只有一種難度）
    function fixDifficulty() {
        const diffs = SONGS[state.song].difficulties;
        if (!diffs.some(d => d.id === state.diff)) {
            state.diff = diffs.some(d => d.id === "normal") ? "normal" : diffs[0].id;
        }
    }
    fixDifficulty();

    /* ---------- 音訊 ---------- */
    function audio() {
        if (!state.audio) {
            const AC = window.AudioContext || window.webkitAudioContext;
            let ctx;
            try { ctx = new AC({ latencyHint: "interactive" }); } catch (err) { ctx = new AC(); }
            const music = ctx.createGain();
            const sfx = ctx.createGain();
            music.connect(ctx.destination);
            sfx.connect(ctx.destination);
            const noise = ctx.createBuffer(1, ctx.sampleRate / 4, ctx.sampleRate);
            const d = noise.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            state.audio = { ctx, music, sfx, noise };
            applyVolume();
        }
        if (state.audio.ctx.state !== "running") state.audio.ctx.resume();
        return state.audio;
    }

    function applyVolume() {
        if (!state.audio) return;
        state.audio.music.gain.value = settings.music / 100;
        state.audio.sfx.gain.value = (settings.sfx / 100) * 0.9;
    }

    /* ---------- 圖片 ---------- */
    const images = {};
    function image(src) {
        if (!images[src]) {
            images[src] = new Promise(resolve => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = src;
            });
        }
        return images[src];
    }
    SONGS.forEach(s => image(s.cover));

    /* ---------- 畫面 ---------- */
    const screens = ["title", "select", "loading", "pause", "result", "settings", "help", "calib"];
    function show(name) {
        screens.forEach(s => { $("screen-" + s).hidden = s !== name; });
    }

    let toastTimer = 0;
    function toast(text) {
        const el = $("toast");
        el.textContent = text;
        el.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove("show"), 3600);
    }

    /* ---------- 全螢幕與方向 ---------- */
    function enterFullscreen() {
        const el = document.documentElement;
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        if (!req || document.fullscreenElement || document.webkitFullscreenElement) return;
        try {
            const p = req.call(el, { navigationUI: "hide" });
            if (p && p.then) {
                p.then(() => {
                    if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {});
                }).catch(() => {});
            }
        } catch (err) {
            /* 不支援就算了 */
        }
    }

    /* ==========================================================
       標題
    ========================================================== */
    $("screen-title").addEventListener("click", () => {
        audio();
        enterFullscreen();
        openSelect();
    });

    /* ==========================================================
       選曲
    ========================================================== */
    const bestAll = () => read(BEST_KEY, {});
    const bestKey = (song, diff) => song.id + ":" + diff;

    function rankOf(score) {
        if (score >= 980000) return "S+";
        if (score >= 950000) return "S";
        if (score >= 900000) return "A";
        if (score >= 800000) return "B";
        if (score >= 700000) return "C";
        return "D";
    }

    function openSelect() {
        show("select");
        renderList();
        renderDetail();
    }

    function renderList() {
        const list = $("song-list");
        const best = bestAll();
        list.innerHTML = "";
        SONGS.forEach((song, i) => {
            const li = document.createElement("li");
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "song-item";
            btn.setAttribute("role", "option");
            btn.setAttribute("aria-selected", String(i === state.song));

            const thumb = document.createElement("img");
            thumb.className = "song-thumb";
            thumb.src = song.cover;
            thumb.alt = "";

            const text = document.createElement("span");
            text.className = "song-text";
            const name = document.createElement("span");
            name.className = "song-name";
            name.textContent = song.title;
            const sub = document.createElement("span");
            sub.className = "song-sub";
            sub.textContent = song.subtitle;
            text.append(name, sub);

            const rank = document.createElement("span");
            rank.className = "song-rank";
            const rec = best[bestKey(song, state.diff)];
            rank.textContent = rec ? rec.rank : "";

            btn.append(thumb, text, rank);
            btn.addEventListener("click", () => {
                if (state.song === i) return;
                state.song = i;
                fixDifficulty();
                renderList();
                renderDetail();
                list.children[i].firstChild.focus({ preventScroll: true });
            });
            li.appendChild(btn);
            list.appendChild(li);
        });
    }

    function renderDetail() {
        const song = SONGS[state.song];
        $("select-bg").style.backgroundImage = `url("${song.cover}")`;
        $("detail-cover").src = song.cover;
        $("detail-title").textContent = song.title;
        $("detail-sub").textContent = song.subtitle;
        $("detail-info").textContent = `${song.artist}　·　BPM ${song.bpm}　·　${song.length}`;

        const row = $("diff-row");
        row.innerHTML = "";
        song.difficulties.forEach(d => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "diff";
            b.dataset.diff = d.id;
            b.setAttribute("role", "radio");
            b.setAttribute("aria-checked", String(d.id === state.diff));
            b.innerHTML = `<span>${d.label}</span><b>${d.level}</b>`;
            b.addEventListener("click", () => {
                state.diff = d.id;
                renderList();
                renderDetail();
            });
            row.appendChild(b);
        });

        const rec = bestAll()[bestKey(song, state.diff)];
        $("best-score").textContent = rec ? String(rec.score).padStart(7, "0") : "—";
        $("best-badge").textContent = rec ? (rec.ap ? "ALL PERFECT" : rec.fc ? "FULL COMBO" : rec.rank) : "";
        write(LAST_KEY, { song: song.id, diff: state.diff });
    }

    $("btn-play").addEventListener("click", () => startSong());

    /* ==========================================================
       遊戲
    ========================================================== */
    async function startSong(reuse) {
        fixDifficulty();
        const song = SONGS[state.song];
        const diff = song.difficulties.find(d => d.id === state.diff);
        const au = audio();

        show("loading");
        $("loading-text").textContent = "載入中……";
        try {
            await song.prepare(au.ctx, text => { $("loading-text").textContent = text; });
        } catch (err) {
            console.error(err);
            show("select");
            toast(err && err.friendly ? err.message : "載入失敗了，請再試一次。");
            return;
        }
        const cover = await image(song.cover);
        const chart = song.buildChart(diff.id);

        stopGame();
        show(null);
        $("btn-pause").hidden = false;
        state.lastRun = { song, diff };
        state.game = new Game({
            canvas: $("stage"),
            audio: au,
            chart,
            cover,
            settings,
            autoplay: settings.autoplay,
            meta: { title: song.title, difficulty: `${diff.label}  Lv.${diff.level}` },
            makePlayer: ctx => song.createPlayer(ctx, au.music),
            onFinish: result => showResult(song, diff, result)
        });
        state.game.start();
    }

    function stopGame() {
        if (state.game) {
            state.game.destroy();
            state.game = null;
        }
        $("btn-pause").hidden = true;
        $("countdown").hidden = true;
        clearTimeout(countdownTimer);
    }

    /* ---------- 暫停 ---------- */
    let countdownTimer = 0;

    function pause() {
        const g = state.game;
        if (!g || g.finished) return;
        clearTimeout(countdownTimer);
        $("countdown").hidden = true;
        g.pause();
        show("pause");
    }

    function resume() {
        const g = state.game;
        if (!g) return;
        show(null);
        const el = $("countdown");
        let n = 3;
        const tick = () => {
            if (state.game !== g) return;
            if (n === 0) {
                el.hidden = true;
                g.resume();
                return;
            }
            el.hidden = false;
            el.textContent = n;
            n--;
            countdownTimer = setTimeout(tick, 500);
        };
        tick();
    }

    $("btn-pause").addEventListener("click", pause);
    $("btn-resume").addEventListener("click", resume);
    $("btn-retry").addEventListener("click", () => {
        stopGame();
        startSong();
    });
    $("btn-quit").addEventListener("click", () => {
        stopGame();
        audio();
        openSelect();
    });

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) pause();
    });
    window.addEventListener("blur", pause);
    window.addEventListener("resize", () => {
        if (state.game) state.game.resize();
    });
    window.addEventListener("keydown", e => {
        if (e.key === "Escape" && state.game && !state.game.finished) {
            if (!$("screen-pause").hidden) resume(); else pause();
        }
    });

    /* ---------- 結算 ---------- */
    function showResult(song, diff, r) {
        $("btn-pause").hidden = true;
        const rank = rankOf(r.score);
        const fc = r.counts.miss === 0 && r.counts.bad === 0;
        const ap = fc && r.counts.good === 0;

        let newBest = false;
        if (!r.autoplay) {
            const best = bestAll();
            const key = bestKey(song, diff.id);
            const prev = best[key];
            if (!prev || r.score > prev.score) {
                newBest = true;
                best[key] = {
                    score: r.score,
                    rank,
                    fc: fc || !!(prev && prev.fc),
                    ap: ap || !!(prev && prev.ap)
                };
            } else {
                prev.fc = prev.fc || fc;
                prev.ap = prev.ap || ap;
            }
            write(BEST_KEY, best);
        }

        $("result-bg").style.backgroundImage = `url("${song.cover}")`;
        $("result-cover").src = song.cover;
        $("result-title").textContent = song.title;
        $("result-diff").textContent = `${diff.label}  Lv.${diff.level}`;
        $("result-rank").textContent = rank;
        $("result-score").textContent = String(r.score).padStart(7, "0");
        $("result-acc").textContent = r.accuracy.toFixed(2) + "%";
        $("r-perfect").textContent = r.counts.perfect;
        $("r-good").textContent = r.counts.good;
        $("r-bad").textContent = r.counts.bad;
        $("r-miss").textContent = r.counts.miss;
        $("r-combo").textContent = `${r.maxCombo} / ${r.total}`;

        const badges = $("result-badges");
        badges.innerHTML = "";
        const badge = (text, cls) => {
            const b = document.createElement("span");
            b.className = "badge " + (cls || "");
            b.textContent = text;
            badges.appendChild(b);
        };
        if (r.autoplay) badge("自動演示", "soft");
        if (ap) badge("ALL PERFECT");
        else if (fc) badge("FULL COMBO", "fc");
        if (newBest) badge("NEW BEST", "soft");

        const tip = $("result-tip");
        if (!r.autoplay && r.offsets.length >= 10) {
            const mean = (r.offsets.reduce((s, v) => s + v, 0) / r.offsets.length) * 1000;
            $("r-offset").textContent = (mean >= 0 ? "+" : "") + mean.toFixed(0) + " ms";
            if (Math.abs(mean) >= 15) {
                const suggest = Math.round((settings.offset + mean) / 5) * 5;
                tip.textContent = `平均${mean > 0 ? "偏晚" : "偏早"} ${Math.abs(mean).toFixed(0)} ms，可以把設定裡的「判定偏移」改成 ${suggest > 0 ? "+" : ""}${suggest} ms。`;
            } else {
                tip.textContent = "節奏抓得很準！";
            }
        } else {
            $("r-offset").textContent = "—";
            tip.textContent = "";
        }

        state.game = null;
        show("result");
    }

    $("btn-again").addEventListener("click", () => startSong());
    $("btn-back").addEventListener("click", () => {
        stopGame();
        openSelect();
    });

    /* ==========================================================
       設定
    ========================================================== */
    const FORMAT = {
        speed: v => v.toFixed(1),
        noteSize: v => Math.round(v * 100) + "%",
        offset: v => (v > 0 ? "+" : "") + v + " ms",
        bgBright: v => v + "%",
        music: v => v + "%",
        sfx: v => v + "%",
        ui: v => v + "%"
    };
    const TOGGLES = ["fcap", "multiHint", "earlyLate", "lowRes"];

    function syncSettingsForm() {
        Object.keys(FORMAT).forEach(key => {
            $("s-" + key).value = settings[key];
            $("v-" + key).textContent = FORMAT[key](settings[key]);
        });
        TOGGLES.forEach(key => { $("s-" + key).checked = !!settings[key]; });
        $("s-autoplay").checked = settings.autoplay;
    }

    Object.keys(FORMAT).forEach(key => {
        const input = $("s-" + key);
        input.addEventListener("input", () => {
            settings[key] = parseFloat(input.value);
            $("v-" + key).textContent = FORMAT[key](settings[key]);
            applyVolume();
            saveSettings();
        });
    });
    TOGGLES.forEach(key => {
        $("s-" + key).addEventListener("change", e => {
            settings[key] = e.target.checked;
            saveSettings();
        });
    });
    $("s-autoplay").addEventListener("change", e => { settings.autoplay = e.target.checked; });
    $("btn-reset").addEventListener("click", () => {
        Object.assign(settings, DEFAULTS);
        syncSettingsForm();
        applyVolume();
        saveSettings();
        toast("已恢復預設值");
    });
    syncSettingsForm();

    $("btn-settings").addEventListener("click", () => show("settings"));
    $("btn-settings-close").addEventListener("click", openSelect);
    $("btn-help").addEventListener("click", () => show("help"));
    $("btn-help-close").addEventListener("click", openSelect);

    /* ==========================================================
       延遲校準：每 0.6 秒一聲「噠」，跟著點，取中位數當作偏移
    ========================================================== */
    const CALIB_BEATS = 16;
    const CALIB_WARMUP = 4;
    const CALIB_GAP = 0.6;
    const calib = { running: false, beats: [], taps: [], clock: { ct: -1, pt: 0 }, result: null, raf: 0 };

    function calibNow() {
        const ctx = state.audio.ctx;
        const ct = ctx.currentTime;
        const pt = performance.now();
        if (ct !== calib.clock.ct) { calib.clock.ct = ct; calib.clock.pt = pt; }
        const lat = typeof ctx.outputLatency === "number" && ctx.outputLatency > 0 && ctx.outputLatency < 0.5
            ? ctx.outputLatency
            : ctx.baseLatency || 0;
        return ct + Math.min((pt - calib.clock.pt) / 1000, 0.05) - lat;
    }

    function calibReset() {
        calib.running = false;
        calib.result = null;
        cancelAnimationFrame(calib.raf);
        $("calib-count").textContent = "開始";
        $("calib-result").textContent = "";
        $("btn-calib-apply").disabled = true;
        $("calib-pad").classList.remove("beat");
    }

    function calibStart() {
        const au = audio();
        const ctx = au.ctx;
        calib.running = true;
        calib.taps = [];
        calib.beats = [];
        const t0 = ctx.currentTime + 0.8;
        for (let i = 0; i < CALIB_BEATS; i++) {
            const t = t0 + i * CALIB_GAP;
            calib.beats.push(t);
            const o = ctx.createOscillator();
            o.frequency.setValueAtTime(i < CALIB_WARMUP ? 1200 : 1600, t);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.5, t + 0.002);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
            o.connect(g).connect(au.music);
            o.start(t);
            o.stop(t + 0.1);
        }
        $("calib-result").textContent = "前 4 聲先聽節奏，之後跟著點";
        const tick = () => {
            if (!calib.running) return;
            const now = calibNow();
            const idx = calib.beats.findIndex(b => b > now) - 1;
            const near = calib.beats.some(b => Math.abs(now - b) < 0.07);
            $("calib-pad").classList.toggle("beat", near);
            const left = idx < 0 ? CALIB_BEATS : CALIB_BEATS - 1 - idx;
            $("calib-count").textContent = idx < CALIB_WARMUP - 1 ? "聽…" : String(Math.max(0, left));
            if (now > calib.beats[CALIB_BEATS - 1] + 0.5) calibFinish();
            else calib.raf = requestAnimationFrame(tick);
        };
        calib.raf = requestAnimationFrame(tick);
    }

    function calibFinish() {
        calib.running = false;
        $("calib-pad").classList.remove("beat");
        const diffs = calib.taps
            .map(t => {
                let best = Infinity;
                calib.beats.slice(CALIB_WARMUP).forEach(b => { if (Math.abs(t - b) < Math.abs(best)) best = t - b; });
                return best;
            })
            .filter(d => Math.abs(d) < 0.3)
            .sort((a, b) => a - b);
        if (diffs.length < 6) {
            $("calib-count").textContent = "再一次";
            $("calib-result").textContent = "點擊次數不夠，請跟著「噠」聲多點幾下。";
            return;
        }
        const median = diffs[diffs.length >> 1] * 1000;
        calib.result = Math.max(-300, Math.min(300, Math.round(median / 5) * 5));
        $("calib-count").textContent = "完成";
        $("calib-result").textContent = `建議判定偏移：${calib.result > 0 ? "+" : ""}${calib.result} ms（目前 ${FORMAT.offset(settings.offset)}）`;
        $("btn-calib-apply").disabled = false;
    }

    $("calib-pad").addEventListener("pointerdown", e => {
        e.preventDefault();
        const pad = $("calib-pad");
        pad.classList.add("hit");
        setTimeout(() => pad.classList.remove("hit"), 90);
        if (!calib.running) {
            calibReset();
            calibStart();
            return;
        }
        const lag = (performance.now() - e.timeStamp) / 1000;
        calib.taps.push(calibNow() - (lag > 0 && lag < 0.1 ? lag : 0));
    });
    $("btn-calib").addEventListener("click", () => {
        calibReset();
        show("calib");
    });
    $("btn-calib-retry").addEventListener("click", () => {
        calibReset();
        calibStart();
    });
    $("btn-calib-apply").addEventListener("click", () => {
        if (calib.result === null) return;
        settings.offset = calib.result;
        saveSettings();
        syncSettingsForm();
        calibReset();
        show("settings");
        toast("已套用判定偏移 " + FORMAT.offset(settings.offset));
    });
    $("btn-calib-close").addEventListener("click", () => {
        calibReset();
        show("settings");
    });

    /* ---------- 介面音效 ---------- */
    document.addEventListener("click", e => {
        const btn = e.target.closest && e.target.closest("button");
        if (!btn || btn.id === "calib-pad" || !state.audio || settings.ui <= 0) return;
        const ctx = state.audio.ctx;
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(1050, t);
        o.frequency.exponentialRampToValueAtTime(760, t + 0.04);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.12 * (settings.ui / 100), t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.06);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.07);
    });

    /* ---------- 啟動 ---------- */
    show("title");

    // 給自動化測試與除錯用
    window.Stringlight = { state, settings, startSong, openSelect, pause, resume, calib };
})();
