/* ==========================================================
   心動節拍：遊戲主程式
   ----------------------------------------------------------
   - 四軌下落式節奏遊戲（D F J K / 觸控）
   - 單點音符與長押音符
   - PERFECT / GREAT / GOOD / MISS 判定、連擊、分數、評級
   - 柳如煙會依照你的表現即時給反應
========================================================== */

(function () {
    "use strict";

    const $ = id => document.getElementById(id);

    /* ---------- 常數 ---------- */
    const LANE_COUNT = 4;
    const LANE_KEYS = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 };
    const KEY_LABELS = ["D", "F", "J", "K"];

    // 判定區間（秒）
    const WINDOW = { perfect: 0.045, great: 0.09, good: 0.15 };
    const WEIGHT = { perfect: 1, great: 0.7, good: 0.4, miss: 0 };
    const JUDGE_COLOR = { perfect: "#ffe58a", great: "#8fd8ff", good: "#a9f0b8", miss: "#ff7a8a" };
    const DIFF_LABEL = { easy: "簡單", normal: "普通", hard: "困難" };

    // 外側兩軌粉紅、內側兩軌紫色
    const LANE_COLOR = [
        ["#ffc2d1", "#ff6f93"],
        ["#d7caff", "#8a68ff"],
        ["#d7caff", "#8a68ff"],
        ["#ffc2d1", "#ff6f93"]
    ];

    const FONT = '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", Arial, sans-serif';

    const PENDING = 0;
    const HOLDING = 1;
    const DONE = 2;

    const SETTINGS_KEY = "heartbeatRhythmSettings";
    const BEST_KEY = "heartbeatRhythmBest";

    /* ---------- 儲存 ---------- */
    function readJSON(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (err) {
            return fallback;
        }
    }

    function writeJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (err) {
            /* 無痕模式等情況下無法儲存，忽略即可 */
        }
    }

    function loadSettings() {
        const base = { speed: 5, offset: 0, music: 80, sfx: 60, autoplay: false };
        const own = readJSON(SETTINGS_KEY, null);
        if (own && typeof own === "object") {
            ["speed", "offset", "music", "sfx"].forEach(k => {
                if (Number.isFinite(own[k])) base[k] = own[k];
            });
            return base;
        }
        // 第一次玩：沿用《心動的每一天》的音量設定
        const story = readJSON("heartEverydaySettings", null);
        if (story && Number.isFinite(story.musicVolume)) base.music = story.musicVolume;
        if (story && Number.isFinite(story.sfxVolume)) base.sfx = story.sfxVolume;
        return base;
    }

    const settings = loadSettings();

    function saveSettings() {
        writeJSON(SETTINGS_KEY, {
            speed: settings.speed,
            offset: settings.offset,
            music: settings.music,
            sfx: settings.sfx
        });
    }

    /* ---------- 歌曲清單 ---------- */
    const SONGS = [
        {
            id: "heartbeat",
            kind: "synth",
            icon: "♥",
            title: "心跳的節拍",
            meta: "原創曲 · 128 BPM · 1:16 · 手工譜面"
        },
        {
            id: "theme",
            kind: "file",
            icon: "♪",
            url: "audio/bgm.mp3",
            title: "心動的每一天",
            meta: "故事主題曲 · 3:27 · 自動生成譜面"
        },
        {
            id: "custom",
            kind: "custom",
            icon: "＋",
            title: "自選音樂",
            meta: "載入你自己的音樂檔，自動生成譜面",
            file: null
        }
    ];

    /* ---------- 柳如煙 ---------- */
    const EXPRESSIONS = {
        normal: "images/heroine.png",
        happy: "images/heroine_happy.png",
        love: "images/heroine_love.png",
        angry: "images/heroine_angry.png"
    };

    const LINES = {
        start: [
            ["normal", "準備好了嗎？跟著心跳的節奏就好。"],
            ["happy", "這首歌……我很喜歡喔。一起加油吧！"],
            ["normal", "放輕鬆，聽著音樂，手指自然就會動了。"]
        ],
        combo30: [["happy", "嗯，節奏很穩呢。"]],
        combo60: [["happy", "好厲害……我也想跟著哼了。"]],
        combo100: [["love", "……和你一起的節奏，好像特別剛好。"]],
        combo200: [["love", "一直這樣下去，好像也不錯呢。"]],
        comboBreak: [
            ["normal", "沒關係，深呼吸，再跟上就好。"],
            ["normal", "別在意，下一個音符還在等你。"]
        ],
        struggling: [
            ["angry", "喂——你有在聽音樂嗎？"],
            ["angry", "專心一點啦！我還在看著呢。"]
        ],
        final: [["happy", "最後一段了，加油！"]]
    };

    const RESULT_LINES = {
        AP: ["love", "……一個音都沒有錯。剛剛那樣，真的很帥。"],
        S: ["love", "和你一起演奏，心跳好像都變快了。下次也要一起喔。"],
        A: ["happy", "表現得很棒呢！我差點跟著你一起跳起來。"],
        B: ["normal", "還不錯喔。再練習幾次，一定會更好。"],
        C: ["normal", "有幾段跟不上呢……要不要再試一次？我陪你。"],
        D: ["angry", "哼，我才不是在擔心你……只是，再來一次啦。"]
    };

    // 預先載入表情圖，切換時不會閃爍
    Object.values(EXPRESSIONS).forEach(src => { const img = new Image(); img.src = src; });

    /* ==========================================================
       狀態
    ========================================================== */
    const state = {
        songIndex: 0,
        difficulty: "normal",
        audio: null,         // { ctx, music, sfx }
        cache: new Map(),    // 已解碼與分析過的音樂
        game: null,
        busy: false
    };

    const isTouch = window.matchMedia("(pointer: coarse)").matches;

    /* ==========================================================
       音訊
    ========================================================== */
    function ensureAudio() {
        if (!state.audio) {
            const AC = window.AudioContext || window.webkitAudioContext;
            let ctx;
            try {
                ctx = new AC({ latencyHint: "interactive" });
            } catch (err) {
                ctx = new AC();
            }
            const music = ctx.createGain();
            const sfx = ctx.createGain();
            music.connect(ctx.destination);
            sfx.connect(ctx.destination);
            state.audio = { ctx, music, sfx };
            applyVolumes();
        }
        if (state.audio.ctx.state === "suspended") state.audio.ctx.resume();
        return state.audio.ctx;
    }

    function applyVolumes() {
        if (!state.audio) return;
        state.audio.music.gain.value = settings.music / 100;
        state.audio.sfx.gain.value = (settings.sfx / 100) * 0.8;
    }

    function outputLatency(ctx) {
        const l = ctx.outputLatency;
        if (typeof l === "number" && l > 0 && l < 0.5) return l;
        return ctx.baseLatency || 0;
    }

    function decodeAudio(ctx, data) {
        return new Promise((resolve, reject) => {
            const p = ctx.decodeAudioData(data, resolve, reject);
            if (p && typeof p.then === "function") p.then(resolve, reject);
        });
    }

    function playHitSound(strong) {
        if (!state.audio || settings.sfx <= 0) return;
        const ctx = state.audio.ctx;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(strong ? 1320 : 990, t);
        osc.frequency.exponentialRampToValueAtTime(strong ? 880 : 660, t + 0.05);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(strong ? 0.22 : 0.12, t + 0.002);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        osc.connect(g).connect(state.audio.sfx);
        osc.start(t);
        osc.stop(t + 0.08);
    }

    function bufferPlayer(ctx, buffer) {
        const gain = ctx.createGain();
        gain.connect(state.audio.music);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(gain);
        let started = false;
        let stopped = false;
        return {
            start(when) {
                src.start(when);
                started = true;
            },
            pump() {},
            stop() {
                if (stopped) return;
                stopped = true;
                const now = ctx.currentTime;
                gain.gain.cancelScheduledValues(now);
                gain.gain.setValueAtTime(gain.gain.value, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.08);
                if (started) {
                    try { src.stop(now + 0.1); } catch (err) { /* 已經停止 */ }
                }
            }
        };
    }

    /* ==========================================================
       準備歌曲與譜面
    ========================================================== */
    class FriendlyError extends Error {}

    function hashString(text) {
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function songKey(song) {
        if (song.kind === "custom") return "custom:" + (song.file ? hashString(song.file.name + song.file.size) : "none");
        return song.id;
    }

    async function analyzedAudio(song) {
        const key = songKey(song);
        if (state.cache.has(key)) return state.cache.get(key);

        const ctx = ensureAudio();
        let data;
        if (song.kind === "file") {
            setLoading("讀取音樂中……");
            try {
                const res = await fetch(song.url);
                if (!res.ok) throw new Error("HTTP " + res.status);
                data = await res.arrayBuffer();
            } catch (err) {
                throw new FriendlyError(
                    "讀不到主題曲檔案。直接用檔案開啟網頁時，瀏覽器會擋住讀取；" +
                    "請改用網頁伺服器（例如 GitHub Pages）開啟，或用「自選音樂」載入 audio/bgm.mp3。");
            }
        } else {
            setLoading("讀取音樂中……");
            data = await song.file.arrayBuffer();
        }

        setLoading("解碼音樂中……");
        let buffer;
        try {
            buffer = await decodeAudio(ctx, data);
        } catch (err) {
            throw new FriendlyError("這個檔案無法解碼，請換成 mp3、wav 或 ogg 等常見格式。");
        }

        setLoading("聆聽節奏、生成譜面中……");
        await nextFrame();
        await nextFrame();
        const channels = [];
        for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) channels.push(buffer.getChannelData(c));
        const analysis = RhythmChart.analyzeAudio(channels, buffer.sampleRate);

        const entry = { buffer, analysis, seed: hashString(key) };
        // 自選音樂只保留最新一首，避免佔用太多記憶體
        if (song.kind === "custom") {
            for (const k of state.cache.keys()) if (k.startsWith("custom:")) state.cache.delete(k);
        }
        state.cache.set(key, entry);
        return entry;
    }

    async function prepareSong(song, difficulty) {
        if (song.kind === "synth") {
            return {
                song,
                difficulty,
                chart: HeartbeatSong.buildChart(difficulty),
                barLines: HeartbeatSong.barLines(),
                makePlayer: ctx => HeartbeatSong.createPlayer(ctx, state.audio.music)
            };
        }
        const entry = await analyzedAudio(song);
        const chart = RhythmChart.generateChart(entry.analysis, difficulty, entry.seed);
        if (!chart.length) throw new FriendlyError("這首音樂找不到明顯的節奏，換一首試試看吧？");
        return {
            song,
            difficulty,
            chart,
            barLines: [],
            makePlayer: ctx => bufferPlayer(ctx, entry.buffer)
        };
    }

    /* ==========================================================
       畫面切換
    ========================================================== */
    const screens = {
        select: $("screen-select"),
        loading: $("screen-loading"),
        pause: $("screen-pause"),
        result: $("screen-result"),
        settings: $("screen-settings")
    };

    function show(name) {
        Object.entries(screens).forEach(([key, el]) => { el.hidden = key !== name; });
    }

    function setLoading(text) {
        $("loading-text").textContent = text;
    }

    function nextFrame() {
        return new Promise(resolve => requestAnimationFrame(() => resolve()));
    }

    let toastTimer = 0;
    function toast(message) {
        const el = $("toast");
        el.textContent = message;
        el.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove("show"), 4200);
    }

    /* ---------- 選曲畫面 ---------- */
    function bestRecords() {
        return readJSON(BEST_KEY, {});
    }

    function renderSongList() {
        const list = $("song-list");
        const best = bestRecords();
        list.innerHTML = "";
        SONGS.forEach((song, index) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "song";
            btn.setAttribute("role", "radio");
            btn.setAttribute("aria-checked", String(index === state.songIndex));
            const record = best[songKey(song) + ":" + state.difficulty];

            const icon = document.createElement("span");
            icon.className = "song-icon";
            icon.textContent = song.icon;

            const info = document.createElement("span");
            const title = document.createElement("span");
            title.className = "song-title";
            title.textContent = song.title;
            const meta = document.createElement("span");
            meta.className = "song-meta";
            meta.textContent = song.meta;
            info.append(title, meta);

            const rank = document.createElement("span");
            rank.className = "song-rank";
            rank.textContent = record ? record.rank : "";

            btn.append(icon, info, rank);
            btn.addEventListener("click", () => {
                state.songIndex = index;
                if (song.kind === "custom") $("file-input").click();
                renderSelect();
                const again = $("song-list").children[index];
                if (again) again.focus();
            });
            list.appendChild(btn);
        });
    }

    function renderSelect() {
        renderSongList();
        document.querySelectorAll(".difficulty").forEach(btn => {
            btn.setAttribute("aria-checked", String(btn.dataset.difficulty === state.difficulty));
        });

        const song = SONGS[state.songIndex];
        const record = bestRecords()[songKey(song) + ":" + state.difficulty];
        const line = $("best-line");
        if (song.kind === "custom" && !song.file) {
            line.textContent = "點一下「自選音樂」來選擇檔案。";
        } else if (record) {
            const extra = record.ap ? " · ALL PERFECT" : record.fc ? " · FULL COMBO" : "";
            line.textContent = `最佳紀錄：${record.rank} · ${record.score.toLocaleString()} · ${record.accuracy.toFixed(2)}%${extra}`;
        } else {
            line.textContent = "還沒有紀錄，來挑戰看看吧！";
        }
    }

    /* ==========================================================
       遊戲進行
    ========================================================== */
    function travelTime() {
        return 2.6 - (settings.speed - 1) * 0.2;
    }

    async function play() {
        if (state.busy) return;
        const song = SONGS[state.songIndex];
        if (song.kind === "custom" && !song.file) {
            $("file-input").click();
            return;
        }

        state.busy = true;
        $("play-button").disabled = true;
        ensureAudio();
        show("loading");
        setLoading("準備中……");

        try {
            const prepared = await prepareSong(song, state.difficulty);
            startGame(prepared);
        } catch (err) {
            console.error(err);
            show("select");
            toast(err instanceof FriendlyError ? err.message : "載入失敗了，請再試一次。");
        } finally {
            state.busy = false;
            $("play-button").disabled = false;
        }
    }

    function startGame(prepared) {
        const ctx = ensureAudio();
        stopGame();

        const notes = prepared.chart.map((n, i) => ({
            id: i,
            t: n.t,
            lane: n.lane,
            dur: n.dur,
            end: n.t + n.dur,
            state: PENDING,
            missed: false,
            dropped: false,
            graceUntil: -Infinity
        }));
        const lanes = Array.from({ length: LANE_COUNT }, () => []);
        notes.forEach(n => lanes[n.lane].push(n));
        const lastEnd = notes.reduce((m, n) => Math.max(m, n.end), 0);

        const travel = travelTime();
        const leadIn = Math.max(2.2, travel + 1);
        const startAt = ctx.currentTime + leadIn;
        const player = prepared.makePlayer(ctx);
        player.start(startAt);

        state.game = {
            prepared,
            notes,
            lanes,
            laneIndex: new Array(LANE_COUNT).fill(0),
            firstVisible: 0,
            holding: new Array(LANE_COUNT).fill(null),
            laneDown: new Array(LANE_COUNT).fill(false),
            laneFlash: new Array(LANE_COUNT).fill(0),
            autoRelease: new Array(LANE_COUNT).fill(-Infinity),
            totalJudgments: notes.reduce((s, n) => s + (n.dur > 0 ? 2 : 1), 0),
            judged: 0,
            weightSum: 0,
            counts: { perfect: 0, great: 0, good: 0, miss: 0 },
            combo: 0,
            maxCombo: 0,
            comboPopAt: 0,
            offsets: [],
            recentMiss: [],
            judgeText: null,
            effects: [],
            startAt,
            travel,
            endTime: lastEnd + 1.8,
            player,
            paused: false,
            finished: false,
            autoplay: settings.autoplay,
            clock: { lastCtx: -1, lastPerf: 0, last: -Infinity },
            saidFinal: false,
            lastStruggle: -Infinity,
            pointers: new Map()
        };

        document.body.classList.add("playing");
        $("hud").hidden = false;
        $("hud-title").textContent = prepared.song.title;
        $("hud-difficulty").textContent = DIFF_LABEL[prepared.difficulty] + (state.game.autoplay ? " · 自動演奏" : "");
        updateHud();
        show(null);
        setExpression("normal");
        setTimeout(() => { if (state.game && !state.game.finished) say("start"); }, 400);
        requestAnimationFrame(frame);
    }

    function stopGame() {
        const g = state.game;
        if (!g) return;
        g.finished = true;
        g.player.stop();
        state.game = null;
        document.body.classList.remove("playing");
        $("hud").hidden = true;
        hideBubble();
        $("countdown").hidden = true;
        clearTimeout(countdownTimer);
        ctx2d.setTransform(1, 0, 0, 1, 0, 0);
        ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    }

    /* ---------- 遊戲時鐘 ----------
       AudioContext 的時間是以音訊區塊跳動的，
       兩次跳動之間用 performance.now() 補間，畫面才會順。 */
    function songTime(g) {
        const ctx = state.audio.ctx;
        const ct = ctx.currentTime;
        const pt = performance.now();
        const c = g.clock;
        if (ct !== c.lastCtx) {
            c.lastCtx = ct;
            c.lastPerf = pt;
        }
        let t = ct;
        if (ctx.state === "running" && !g.paused) t += Math.min((pt - c.lastPerf) / 1000, 0.05);
        t = t - outputLatency(ctx) - g.startAt - settings.offset / 1000;
        if (t < c.last && c.last - t < 0.05) t = c.last; // 避免時間微幅倒退造成音符抖動
        c.last = t;
        return t;
    }

    // 把輸入事件發生的時間換算成歌曲時間（處理事件時可能已經晚了幾毫秒）
    function eventTime(g, event) {
        const t = songTime(g);
        const lag = (performance.now() - event.timeStamp) / 1000;
        return lag > 0 && lag < 0.1 ? t - lag : t;
    }

    /* ---------- 判定 ---------- */
    function judge(kind, lane, dt) {
        const g = state.game;
        g.counts[kind]++;
        g.judged++;
        g.weightSum += WEIGHT[kind];

        if (kind === "miss") {
            if (g.combo >= 20) say("comboBreak");
            g.combo = 0;
        } else {
            g.combo++;
            g.comboPopAt = performance.now();
            if (g.combo > g.maxCombo) g.maxCombo = g.combo;
            if (g.combo === 30) say("combo30");
            else if (g.combo === 60) say("combo60");
            else if (g.combo === 100) say("combo100");
            else if (g.combo === 200) say("combo200");
            if (g.combo % 10 === 0) bounceHeroine();
        }
        if (dt !== null && kind !== "miss") g.offsets.push(dt);

        g.recentMiss.push(kind === "miss");
        if (g.recentMiss.length > 10) g.recentMiss.shift();
        const misses = g.recentMiss.filter(Boolean).length;
        const now = performance.now();
        if (misses >= 6 && now - g.lastStruggle > 12000) {
            g.lastStruggle = now;
            say("struggling", true);
        }

        g.judgeText = {
            kind,
            at: now,
            hint: dt === null || kind === "perfect" || kind === "miss" ? "" : dt < 0 ? "EARLY" : "LATE"
        };
        if (lane !== null && kind !== "miss") spawnEffect(lane, kind);
        updateHud();
    }

    function hitHead(note, dt, t) {
        const g = state.game;
        const a = Math.abs(dt);
        const kind = a <= WINDOW.perfect ? "perfect" : a <= WINDOW.great ? "great" : "good";
        judge(kind, note.lane, dt);
        if (note.dur > 0) {
            note.state = HOLDING;
            g.holding[note.lane] = note;
        } else {
            note.state = DONE;
        }
        return kind;
    }

    function finishHold(note) {
        const g = state.game;
        note.state = DONE;
        g.holding[note.lane] = null;
        judge("perfect", note.lane, null);
    }

    function dropHold(note) {
        const g = state.game;
        note.state = DONE;
        note.dropped = true;
        g.holding[note.lane] = null;
        judge("miss", note.lane, null);
    }

    function press(lane, t) {
        const g = state.game;
        if (!g || g.paused || g.finished) return;
        if (g.laneDown[lane]) return;
        g.laneDown[lane] = true;
        g.laneFlash[lane] = 1;
        if (g.autoplay) return;

        // 暫停回來後重新按住長押
        const held = g.holding[lane];
        if (held && t <= held.graceUntil) {
            held.graceUntil = -Infinity;
            return;
        }

        const list = g.lanes[lane];
        for (let i = g.laneIndex[lane]; i < list.length; i++) {
            const n = list[i];
            if (n.state !== PENDING) continue;
            const dt = t - n.t;
            if (dt < -WINDOW.good) break;
            if (dt > WINDOW.good) continue;
            const kind = hitHead(n, dt, t);
            playHitSound(kind === "perfect");
            return;
        }
        playHitSound(false);
    }

    function release(lane, t) {
        const g = state.game;
        if (!g || g.finished) return;
        g.laneDown[lane] = false;
        if (g.autoplay || g.paused) return;
        const n = g.holding[lane];
        if (!n) return;
        if (t >= n.end - WINDOW.good) finishHold(n);
        else dropHold(n);
    }

    /* ---------- 每幀更新 ---------- */
    function update(g, t) {
        for (let lane = 0; lane < LANE_COUNT; lane++) {
            const list = g.lanes[lane];
            for (let i = g.laneIndex[lane]; i < list.length; i++) {
                const n = list[i];
                if (n.state === DONE) {
                    if (i === g.laneIndex[lane]) g.laneIndex[lane]++;
                    continue;
                }
                if (n.state === PENDING) {
                    if (g.autoplay && t >= n.t) {
                        hitHead(n, 0, t);
                        playHitSound(true);
                        g.laneDown[lane] = true;
                        g.laneFlash[lane] = 1;
                        g.autoRelease[lane] = n.dur > 0 ? Infinity : t + 0.07;
                        if (n.state === DONE) continue;
                    } else if (t - n.t > WINDOW.good) {
                        n.state = DONE;
                        n.missed = true;
                        judge("miss", lane, null);
                        if (n.dur > 0) judge("miss", lane, null); // 長押的尾端也一起算失誤
                        continue;
                    } else {
                        break;
                    }
                }
                if (n.state === HOLDING) {
                    if (t >= n.end) {
                        finishHold(n);
                        if (g.autoplay) g.autoRelease[lane] = t + 0.05;
                        continue;
                    }
                    if (!g.autoplay && !g.laneDown[lane] && t > n.graceUntil) {
                        dropHold(n);
                        continue;
                    }
                    if (Math.random() < 0.35) spawnSparkle(lane);
                    break;
                }
            }
            if (g.autoplay && g.laneDown[lane] && t >= g.autoRelease[lane]) g.laneDown[lane] = false;
        }

        const progress = Math.min(1, Math.max(0, t / (g.endTime - 1.8)));
        $("hud-progress-fill").style.width = (progress * 100).toFixed(2) + "%";
        if (!g.saidFinal && progress > 0.86) {
            g.saidFinal = true;
            say("final");
        }

        if (t >= g.endTime) finishGame();
    }

    function frame() {
        const g = state.game;
        if (!g || g.finished) return;
        g.player.pump();
        const t = songTime(g);
        if (!g.paused) update(g, t);
        if (state.game === g && !g.finished) {
            draw(g, t);
            requestAnimationFrame(frame);
        }
    }

    /* ==========================================================
       繪圖
    ========================================================== */
    const canvas = $("playfield");
    const ctx2d = canvas.getContext("2d");
    let view = { w: 0, h: 0, dpr: 1 };

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        view = { w: window.innerWidth, h: window.innerHeight, dpr };
        canvas.width = Math.round(view.w * dpr);
        canvas.height = Math.round(view.h * dpr);
        if (!state.game) ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    }

    function layout() {
        const fieldW = Math.min(440, view.w - 24);
        const fieldX = (view.w - fieldW) / 2;
        const laneW = fieldW / LANE_COUNT;
        const judgeY = view.h * (view.h > view.w ? 0.82 : 0.84);
        const noteH = Math.max(16, Math.min(24, laneW * 0.22));
        return { fieldW, fieldX, laneW, judgeY, noteH };
    }

    function roundRect(c, x, y, w, h, r) {
        const rr = Math.min(r, h / 2, w / 2);
        c.beginPath();
        c.moveTo(x + rr, y);
        c.arcTo(x + w, y, x + w, y + h, rr);
        c.arcTo(x + w, y + h, x, y + h, rr);
        c.arcTo(x, y + h, x, y, rr);
        c.arcTo(x, y, x + w, y, rr);
        c.closePath();
    }

    function heartPath(c, cx, cy, size) {
        const s = size / 2;
        c.beginPath();
        c.moveTo(cx, cy + s * 0.9);
        c.bezierCurveTo(cx - s * 1.2, cy + s * 0.1, cx - s * 0.9, cy - s * 0.95, cx, cy - s * 0.35);
        c.bezierCurveTo(cx + s * 0.9, cy - s * 0.95, cx + s * 1.2, cy + s * 0.1, cx, cy + s * 0.9);
        c.closePath();
    }

    function draw(g, t) {
        const c = ctx2d;
        const L = layout();
        const { fieldX, fieldW, laneW, judgeY, noteH } = L;
        const span = judgeY + noteH * 2;
        const yFor = time => judgeY - ((time - t) / g.travel) * span;

        c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
        c.clearRect(0, 0, view.w, view.h);

        // 軌道背景
        const bg = c.createLinearGradient(0, 0, 0, view.h);
        bg.addColorStop(0, "rgba(16, 14, 32, 0.35)");
        bg.addColorStop(0.7, "rgba(16, 14, 32, 0.82)");
        bg.addColorStop(1, "rgba(16, 14, 32, 0.9)");
        c.fillStyle = bg;
        c.fillRect(fieldX, 0, fieldW, view.h);

        c.fillStyle = "rgba(255, 255, 255, 0.05)";
        for (let i = 1; i < LANE_COUNT; i++) c.fillRect(fieldX + laneW * i - 0.5, 0, 1, view.h);
        c.fillStyle = "rgba(199, 182, 255, 0.35)";
        c.fillRect(fieldX - 1, 0, 1, view.h);
        c.fillRect(fieldX + fieldW, 0, 1, view.h);

        // 小節線
        c.fillStyle = "rgba(255, 255, 255, 0.07)";
        for (const bl of g.prepared.barLines) {
            const y = yFor(bl);
            if (y < -2 || y > judgeY) continue;
            c.fillRect(fieldX, y, fieldW, 1);
        }

        // 按下時的軌道光
        for (let lane = 0; lane < LANE_COUNT; lane++) {
            const f = g.laneDown[lane] ? 1 : g.laneFlash[lane];
            if (f <= 0.01) continue;
            const x = fieldX + laneW * lane;
            const glow = c.createLinearGradient(0, judgeY, 0, judgeY - view.h * 0.45);
            glow.addColorStop(0, `rgba(255, 170, 200, ${0.32 * f})`);
            glow.addColorStop(1, "rgba(255, 170, 200, 0)");
            c.fillStyle = glow;
            c.fillRect(x + 1, judgeY - view.h * 0.45, laneW - 2, view.h * 0.45);
            if (!g.laneDown[lane]) g.laneFlash[lane] = Math.max(0, f - 0.12);
        }

        // 判定線
        const line = c.createLinearGradient(fieldX, 0, fieldX + fieldW, 0);
        line.addColorStop(0, "#ff85a2");
        line.addColorStop(0.5, "#ffffff");
        line.addColorStop(1, "#9c7bff");
        c.save();
        c.shadowColor = "rgba(255, 133, 162, 0.8)";
        c.shadowBlur = 14;
        c.fillStyle = line;
        c.fillRect(fieldX, judgeY - 1.5, fieldW, 3);
        c.restore();

        // 接收器
        for (let lane = 0; lane < LANE_COUNT; lane++) {
            const x = fieldX + laneW * lane + 6;
            const down = g.laneDown[lane];
            roundRect(c, x, judgeY - noteH / 2, laneW - 12, noteH, 8);
            c.strokeStyle = down ? "rgba(255, 255, 255, 0.95)" : "rgba(255, 255, 255, 0.3)";
            c.lineWidth = down ? 2 : 1.5;
            c.stroke();
            if (!isTouch) {
                c.fillStyle = down ? "#ffffff" : "rgba(255, 255, 255, 0.45)";
                c.font = "bold 14px " + FONT;
                c.textAlign = "center";
                c.textBaseline = "middle";
                c.fillText(KEY_LABELS[lane], x + (laneW - 12) / 2, judgeY + noteH + 14);
            }
        }

        // 音符
        const notes = g.notes;
        while (g.firstVisible < notes.length && notes[g.firstVisible].end < t - 1.5) g.firstVisible++;
        const horizon = t + g.travel * 1.1;
        for (let i = g.firstVisible; i < notes.length; i++) {
            const n = notes[i];
            if (n.t > horizon) break;
            if (n.state === DONE && !n.missed && !n.dropped) continue;
            drawNote(c, n, L, yFor, t);
        }

        drawEffects(c, L);
        drawCombo(c, g, L);

        // 開始前的提示
        if (t < -0.4) {
            const a = Math.min(1, (-0.4 - t) * 2);
            c.globalAlpha = a;
            c.fillStyle = "#ffffff";
            c.textAlign = "center";
            c.textBaseline = "middle";
            c.font = "900 34px " + FONT;
            c.fillText("READY", fieldX + fieldW / 2, view.h * 0.4);
            c.font = "14px " + FONT;
            c.fillStyle = "rgba(255, 255, 255, 0.7)";
            c.fillText(isTouch ? "點擊下方軌道來打擊" : "D F J K 打擊　·　Esc 暫停", fieldX + fieldW / 2, view.h * 0.4 + 36);
            c.globalAlpha = 1;
        }
    }

    function drawNote(c, n, L, yFor, t) {
        const { fieldX, laneW, judgeY, noteH } = L;
        const x = fieldX + laneW * n.lane + 6;
        const w = laneW - 12;
        const [light, deep] = LANE_COLOR[n.lane];
        const faded = n.missed || n.dropped;

        let headY = yFor(n.t);
        if (n.state === HOLDING) headY = judgeY;

        c.globalAlpha = faded ? 0.3 : 1;

        // 長押的身體
        if (n.dur > 0) {
            const tailY = yFor(n.end);
            const top = Math.max(-noteH, tailY);
            const bottom = n.dropped ? yFor(Math.max(n.t, t - 0.15)) : headY;
            if (bottom > top) {
                const bw = w * 0.52;
                const bx = x + (w - bw) / 2;
                const body = c.createLinearGradient(0, top, 0, bottom);
                body.addColorStop(0, deep + "55");
                body.addColorStop(1, n.state === HOLDING ? light + "ee" : deep + "aa");
                c.fillStyle = body;
                roundRect(c, bx, top, bw, bottom - top, bw / 2);
                c.fill();
                if (n.state === HOLDING) {
                    c.save();
                    c.shadowColor = deep;
                    c.shadowBlur = 16;
                    c.fill();
                    c.restore();
                }
                // 尾端
                roundRect(c, x + w * 0.18, tailY - noteH * 0.3, w * 0.64, noteH * 0.6, 6);
                c.fillStyle = light;
                c.fill();
            }
        }

        if (headY > -noteH && headY < view.h + noteH && !(n.dropped && n.dur > 0)) {
            const grad = c.createLinearGradient(0, headY - noteH / 2, 0, headY + noteH / 2);
            grad.addColorStop(0, light);
            grad.addColorStop(1, deep);
            roundRect(c, x, headY - noteH / 2, w, noteH, 8);
            c.fillStyle = grad;
            c.fill();
            c.fillStyle = "rgba(255, 255, 255, 0.55)";
            c.fillRect(x + 8, headY - noteH / 2 + 3, w - 16, 2);
            heartPath(c, x + w / 2, headY + 1, noteH * 0.62);
            c.fillStyle = "rgba(255, 255, 255, 0.92)";
            c.fill();
        }
        c.globalAlpha = 1;
    }

    /* ---------- 特效 ---------- */
    function spawnEffect(lane, kind) {
        const g = state.game;
        const parts = [];
        const count = kind === "perfect" ? 7 : 4;
        for (let i = 0; i < count; i++) {
            const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
            const speed = 90 + Math.random() * 140;
            parts.push({ vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, size: 6 + Math.random() * 6 });
        }
        g.effects.push({ lane, kind, at: performance.now(), parts, ring: true });
        if (g.effects.length > 40) g.effects.shift();
    }

    function spawnSparkle(lane) {
        const g = state.game;
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
        const speed = 60 + Math.random() * 90;
        g.effects.push({ lane, kind: "perfect", at: performance.now(), parts: [{ vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, size: 4 + Math.random() * 4 }], ring: false });
        if (g.effects.length > 60) g.effects.shift();
    }

    function drawEffects(c, L) {
        const g = state.game;
        const now = performance.now();
        const { fieldX, laneW, judgeY } = L;
        g.effects = g.effects.filter(e => now - e.at < 500);
        for (const e of g.effects) {
            const age = (now - e.at) / 1000;
            const cx = fieldX + laneW * (e.lane + 0.5);
            const color = JUDGE_COLOR[e.kind];
            if (e.ring && age < 0.25) {
                const p = age / 0.25;
                c.beginPath();
                c.arc(cx, judgeY, laneW * (0.2 + 0.32 * p), 0, Math.PI * 2);
                c.strokeStyle = color;
                c.globalAlpha = 0.9 * (1 - p);
                c.lineWidth = 2.5 * (1 - p) + 0.5;
                c.stroke();
            }
            for (const p of e.parts) {
                const x = cx + p.vx * age;
                const y = judgeY + p.vy * age + 160 * age * age;
                c.globalAlpha = Math.max(0, 1 - age / 0.5);
                heartPath(c, x, y, p.size);
                c.fillStyle = color;
                c.fill();
            }
        }
        c.globalAlpha = 1;
    }

    function drawCombo(c, g, L) {
        const cx = L.fieldX + L.fieldW / 2;
        const now = performance.now();
        c.textAlign = "center";
        c.textBaseline = "middle";

        if (g.combo >= 3) {
            const pop = Math.max(0, 1 - (now - g.comboPopAt) / 120);
            const size = 46 + pop * 8;
            c.font = `900 ${size}px ${FONT}`;
            c.fillStyle = "rgba(255, 255, 255, 0.92)";
            c.save();
            c.shadowColor = "rgba(255, 133, 162, 0.7)";
            c.shadowBlur = 18;
            c.fillText(String(g.combo), cx, view.h * 0.36);
            c.restore();
            c.font = `bold 12px ${FONT}`;
            c.fillStyle = "rgba(255, 210, 225, 0.85)";
            c.fillText("C O M B O", cx, view.h * 0.36 + 34);
        }

        const j = g.judgeText;
        if (j) {
            const age = now - j.at;
            if (age < 600) {
                const scale = age < 80 ? 1.25 - (age / 80) * 0.25 : 1;
                c.globalAlpha = age > 400 ? 1 - (age - 400) / 200 : 1;
                c.font = `900 ${Math.round(30 * scale)}px ${FONT}`;
                c.fillStyle = JUDGE_COLOR[j.kind];
                c.fillText(j.kind.toUpperCase(), cx, view.h * 0.5);
                if (j.hint) {
                    c.font = `bold 12px ${FONT}`;
                    c.fillStyle = j.hint === "EARLY" ? "#8fd8ff" : "#ffb38a";
                    c.fillText(j.hint, cx, view.h * 0.5 + 26);
                }
                c.globalAlpha = 1;
            }
        }
    }

    /* ==========================================================
       HUD
    ========================================================== */
    function currentScore(g) {
        return g.totalJudgments ? Math.round(1000000 * g.weightSum / g.totalJudgments) : 0;
    }

    function currentAccuracy(g) {
        return g.judged ? (g.weightSum / g.judged) * 100 : 100;
    }

    function updateHud() {
        const g = state.game;
        if (!g) return;
        $("hud-score").textContent = String(currentScore(g)).padStart(7, "0");
        $("hud-accuracy").textContent = currentAccuracy(g).toFixed(2) + "%";
    }

    /* ==========================================================
       柳如煙的反應
    ========================================================== */
    let bubbleTimer = 0;
    let faceTimer = 0;
    let lastSayAt = 0;
    const lineCursor = {};

    function setExpression(face) {
        const img = $("heroine-image");
        const src = EXPRESSIONS[face] || EXPRESSIONS.normal;
        if (!img.src.endsWith(src)) img.src = src;
    }

    function say(key, urgent) {
        const now = performance.now();
        if (!urgent && now - lastSayAt < 1500) return;
        const options = LINES[key];
        if (!options) return;
        const i = (lineCursor[key] || 0) % options.length;
        lineCursor[key] = i + 1;
        const [face, text] = options[i];
        lastSayAt = now;

        setExpression(face);
        const bubble = $("heroine-bubble");
        bubble.textContent = text;
        bubble.classList.add("show");
        clearTimeout(bubbleTimer);
        clearTimeout(faceTimer);
        bubbleTimer = setTimeout(hideBubble, 2800);
        faceTimer = setTimeout(() => setExpression("normal"), 3400);
    }

    function hideBubble() {
        $("heroine-bubble").classList.remove("show");
    }

    function bounceHeroine() {
        const img = $("heroine-image");
        img.classList.remove("bounce");
        void img.offsetWidth;
        img.classList.add("bounce");
    }

    /* ==========================================================
       暫停與繼續
    ========================================================== */
    let countdownTimer = 0;

    function pauseGame() {
        const g = state.game;
        if (!g || g.finished) return;
        clearTimeout(countdownTimer);
        $("countdown").hidden = true;
        if (!g.paused) {
            g.paused = true;
            state.audio.ctx.suspend();
            // 暫停期間放開的按鍵不算長押失敗；回來後有一小段時間可以重新按住
            for (let lane = 0; lane < LANE_COUNT; lane++) g.laneDown[lane] = false;
            g.pointers.clear();
        }
        show("pause");
        $("resume-button").focus();
    }

    function resumeGame() {
        const g = state.game;
        if (!g || !g.paused) return;
        show(null);
        const el = $("countdown");
        let n = 3;
        const tick = () => {
            if (state.game !== g) return;
            if (n === 0) {
                el.hidden = true;
                const t = g.clock.last;
                g.holding.forEach(h => { if (h) h.graceUntil = t + 0.35; });
                g.paused = false;
                state.audio.ctx.resume();
                return;
            }
            el.hidden = false;
            el.textContent = String(n);
            el.classList.remove("tick");
            void el.offsetWidth;
            el.classList.add("tick");
            n--;
            countdownTimer = setTimeout(tick, 450);
        };
        tick();
    }

    function retryGame() {
        const g = state.game;
        if (!g) return;
        const prepared = g.prepared;
        stopGame();
        ensureAudio();
        startGame(prepared);
    }

    function quitToSelect() {
        stopGame();
        ensureAudio();
        show("select");
        renderSelect();
    }

    /* ==========================================================
       結算
    ========================================================== */
    function rankFor(accuracy) {
        if (accuracy >= 95) return "S";
        if (accuracy >= 90) return "A";
        if (accuracy >= 80) return "B";
        if (accuracy >= 70) return "C";
        return "D";
    }

    function finishGame() {
        const g = state.game;
        if (!g || g.finished) return;

        const score = currentScore(g);
        const accuracy = g.totalJudgments ? (g.weightSum / g.totalJudgments) * 100 : 0;
        const rank = rankFor(accuracy);
        const fc = g.counts.miss === 0 && g.judged > 0;
        const ap = fc && g.counts.great === 0 && g.counts.good === 0;
        const prepared = g.prepared;
        const autoplay = g.autoplay;
        const offsets = g.offsets.slice();
        const counts = Object.assign({}, g.counts);
        const maxCombo = g.maxCombo;

        stopGame();

        // 最佳紀錄
        let newBest = false;
        if (!autoplay) {
            const best = bestRecords();
            const key = songKey(prepared.song) + ":" + prepared.difficulty;
            const prev = best[key];
            if (!prev || score > prev.score) {
                newBest = true;
                best[key] = {
                    score,
                    accuracy: Math.round(accuracy * 100) / 100,
                    rank,
                    fc: fc || (prev && prev.fc) || false,
                    ap: ap || (prev && prev.ap) || false
                };
            } else {
                prev.fc = prev.fc || fc;
                prev.ap = prev.ap || ap;
            }
            writeJSON(BEST_KEY, best);
        }

        $("result-song").textContent = `${prepared.song.title} · ${DIFF_LABEL[prepared.difficulty]}`;
        $("result-rank").textContent = rank;
        $("result-score").textContent = score.toLocaleString();
        $("result-accuracy").textContent = accuracy.toFixed(2) + "%";
        $("result-perfect").textContent = counts.perfect;
        $("result-great").textContent = counts.great;
        $("result-good").textContent = counts.good;
        $("result-miss").textContent = counts.miss;
        $("result-combo").textContent = maxCombo;

        const badges = $("result-badges");
        badges.innerHTML = "";
        const addBadge = (text, soft) => {
            const b = document.createElement("span");
            b.className = "badge" + (soft ? " soft" : "");
            b.textContent = text;
            badges.appendChild(b);
        };
        if (autoplay) addBadge("自動演奏", true);
        if (ap) addBadge("ALL PERFECT");
        else if (fc) addBadge("FULL COMBO");
        if (newBest && !autoplay) addBadge("NEW BEST");

        // 平均偏差與偏移建議
        const tip = $("result-tip");
        if (offsets.length >= 10 && !autoplay) {
            const mean = offsets.reduce((s, v) => s + v, 0) / offsets.length * 1000;
            $("result-offset").textContent = (mean >= 0 ? "+" : "") + mean.toFixed(0) + " ms";
            if (Math.abs(mean) >= 15) {
                const suggest = Math.round((settings.offset + mean) / 5) * 5;
                tip.textContent = `你的按鍵平均${mean > 0 ? "偏晚" : "偏早"} ${Math.abs(mean).toFixed(0)} ms，` +
                    `可以到設定把「判定偏移」改成 ${suggest > 0 ? "+" : ""}${suggest} ms 試試。`;
            } else {
                tip.textContent = "節奏抓得很準，不需要調整偏移。";
            }
        } else {
            $("result-offset").textContent = "—";
            tip.textContent = "";
        }

        const [face, line] = autoplay
            ? ["happy", "這是示範喔。換你來試試看吧？"]
            : ap ? RESULT_LINES.AP : RESULT_LINES[rank];
        $("result-heroine").src = EXPRESSIONS[face];
        $("result-line").textContent = line;

        show("result");
        $("again-button").focus();
        state.lastPrepared = prepared;
    }

    /* ==========================================================
       輸入
    ========================================================== */
    window.addEventListener("keydown", event => {
        const g = state.game;
        if (event.code === "Escape") {
            if (g && !g.finished) {
                event.preventDefault();
                if (g.paused && !screens.pause.hidden) resumeGame();
                else pauseGame();
            } else if (!screens.settings.hidden) {
                closeSettings();
            }
            return;
        }
        if (!g || g.finished || g.paused) return;
        const lane = LANE_KEYS[event.code];
        if (lane === undefined) return;
        event.preventDefault();
        // 一般的自動重複會被 press() 忽略；暫停回來時仍按著的鍵則能接續長押
        press(lane, eventTime(g, event));
    });

    window.addEventListener("keyup", event => {
        const g = state.game;
        if (!g) return;
        const lane = LANE_KEYS[event.code];
        if (lane === undefined) return;
        event.preventDefault();
        release(lane, eventTime(g, event));
    });

    function laneFromX(x) {
        const { fieldX, laneW } = layout();
        return Math.max(0, Math.min(LANE_COUNT - 1, Math.floor((x - fieldX) / laneW)));
    }

    canvas.addEventListener("pointerdown", event => {
        const g = state.game;
        if (!g || g.finished || g.paused) return;
        event.preventDefault();
        const lane = laneFromX(event.clientX);
        g.pointers.set(event.pointerId, lane);
        try { canvas.setPointerCapture(event.pointerId); } catch (err) { /* 舊瀏覽器 */ }
        press(lane, eventTime(g, event));
    });

    const pointerUp = event => {
        const g = state.game;
        if (!g) return;
        const lane = g.pointers.get(event.pointerId);
        if (lane === undefined) return;
        g.pointers.delete(event.pointerId);
        // 同一軌還有其他手指按著，就不算放開
        if ([...g.pointers.values()].includes(lane)) return;
        release(lane, eventTime(g, event));
    };
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("contextmenu", event => event.preventDefault());

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) pauseGame();
    });
    window.addEventListener("blur", pauseGame);
    window.addEventListener("resize", resize);

    /* ---------- 按鈕 ---------- */
    document.querySelectorAll(".difficulty").forEach(btn => {
        btn.addEventListener("click", () => {
            state.difficulty = btn.dataset.difficulty;
            renderSelect();
        });
    });

    $("play-button").addEventListener("click", play);
    $("pause-button").addEventListener("click", pauseGame);
    $("resume-button").addEventListener("click", resumeGame);
    $("retry-button").addEventListener("click", retryGame);
    $("quit-button").addEventListener("click", quitToSelect);
    $("again-button").addEventListener("click", () => {
        if (state.lastPrepared) {
            ensureAudio();
            startGame(state.lastPrepared);
        }
    });
    $("back-button").addEventListener("click", () => {
        show("select");
        renderSelect();
    });

    $("file-input").addEventListener("change", event => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const song = SONGS.find(s => s.kind === "custom");
        song.file = file;
        song.title = file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "自選音樂";
        song.meta = "自選音樂 · 自動生成譜面 · 點一下可以換檔案";
        state.songIndex = SONGS.indexOf(song);
        event.target.value = "";
        renderSelect();
        toast("已載入「" + song.title + "」，按「開始演奏」就會自動生成譜面。");
    });

    /* ---------- 設定 ---------- */
    const settingInputs = {
        speed: { el: $("speed"), out: $("speed-value"), fmt: v => String(v) },
        offset: { el: $("offset"), out: $("offset-value"), fmt: v => (v > 0 ? "+" : "") + v + " ms" },
        music: { el: $("music"), out: $("music-value"), fmt: v => v + "%" },
        sfx: { el: $("sfx"), out: $("sfx-value"), fmt: v => v + "%" }
    };

    Object.entries(settingInputs).forEach(([key, item]) => {
        item.el.value = settings[key];
        item.out.textContent = item.fmt(settings[key]);
        item.el.addEventListener("input", () => {
            settings[key] = parseFloat(item.el.value);
            item.out.textContent = item.fmt(settings[key]);
            applyVolumes();
            saveSettings();
        });
    });

    $("autoplay").checked = settings.autoplay;
    $("autoplay").addEventListener("change", event => {
        settings.autoplay = event.target.checked;
    });

    function openSettings() {
        show("settings");
        $("speed").focus();
    }

    function closeSettings() {
        show("select");
        renderSelect();
        if (settings.sfx > 0 && state.audio) playHitSound(true);
    }

    $("settings-button").addEventListener("click", openSettings);
    $("settings-done").addEventListener("click", closeSettings);

    /* ---------- 初始化 ---------- */
    if (isTouch) $("key-hint").textContent = "點擊畫面下方的四條軌道來打擊";
    resize();
    renderSelect();
    show("select");

    // 方便在瀏覽器主控台或自動化測試中檢查狀態
    window.HeartbeatRhythm = {
        state,
        settings,
        startWith(songIndex, difficulty) {
            state.songIndex = songIndex;
            state.difficulty = difficulty;
            return play();
        }
    };
})();
