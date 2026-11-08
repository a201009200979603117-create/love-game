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

    const DEFAULTS = { speed: 5, noteSize: 1, offset: 0, music: 80, sfx: 60 };
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
    if (!SONGS[state.song].difficulties.some(d => d.id === state.diff)) state.diff = "normal";

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
    const screens = ["title", "select", "loading", "pause", "result", "settings", "help"];
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
                if (!song.difficulties.some(d => d.id === state.diff)) state.diff = song.difficulties[0].id;
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
        music: v => v + "%",
        sfx: v => v + "%"
    };

    Object.keys(FORMAT).forEach(key => {
        const input = $("s-" + key);
        const out = $("v-" + key);
        input.value = settings[key];
        out.textContent = FORMAT[key](settings[key]);
        input.addEventListener("input", () => {
            settings[key] = parseFloat(input.value);
            out.textContent = FORMAT[key](settings[key]);
            applyVolume();
            saveSettings();
        });
    });
    $("s-autoplay").addEventListener("change", e => { settings.autoplay = e.target.checked; });

    $("btn-settings").addEventListener("click", () => show("settings"));
    $("btn-settings-close").addEventListener("click", openSelect);
    $("btn-help").addEventListener("click", () => show("help"));
    $("btn-help-close").addEventListener("click", openSelect);

    /* ---------- 啟動 ---------- */
    show("title");

    // 給自動化測試與除錯用
    window.Stringlight = { state, settings, startSong, openSelect, pause, resume };
})();
