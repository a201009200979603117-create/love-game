/* ==========================================================
   心動節拍：自動譜面產生器
   ----------------------------------------------------------
   1. analyzeAudio()  ：用頻譜通量（spectral flux）找出音樂中的「起音」
   2. generateChart() ：依難度挑選起音，分配軌道、雙押與長押

   這個檔案不依賴 DOM，瀏覽器與 Node.js 都能使用，
   方便直接在終端機測試譜面品質。
========================================================== */

(function (root) {
    "use strict";

    const LANES = 4;

    /* ---------- 難度參數 ---------- */
    const DIFFICULTY = {
        easy: {
            density: 1.0,     // 每秒平均音符數上限
            minGap: 0.36,     // 兩個音符最短間隔（秒）
            jackGap: 0.5,     // 同一軌連打最短間隔
            chordRatio: 0,    // 雙押比例
            holdGap: 0.95,    // 與下一個音符距離超過這個秒數才考慮長押
            holdMax: 2.4,
            holdRatio: 0.2   // 長押最多佔幾成
        },
        normal: {
            density: 1.9,
            minGap: 0.2,
            jackGap: 0.3,
            chordRatio: 0.05,
            holdGap: 0.8,
            holdMax: 2.6,
            holdRatio: 0.12
        },
        hard: {
            density: 3.1,
            minGap: 0.115,
            jackGap: 0.2,
            chordRatio: 0.11,
            holdGap: 0.7,
            holdMax: 2.8,
            holdRatio: 0.07
        }
    };

    /* ---------- 小工具 ---------- */

    // 可重現的亂數（同一首歌每次生成的譜面都一樣）
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

    function percentile(values, p) {
        if (!values.length) return 0;
        const sorted = Array.from(values).sort((a, b) => a - b);
        const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
        return sorted[idx];
    }

    // 原地 radix-2 FFT
    function fft(re, im) {
        const n = re.length;
        for (let i = 1, j = 0; i < n; i++) {
            let bit = n >> 1;
            for (; j & bit; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) {
                let t = re[i]; re[i] = re[j]; re[j] = t;
                t = im[i]; im[i] = im[j]; im[j] = t;
            }
        }
        for (let len = 2; len <= n; len <<= 1) {
            const ang = -2 * Math.PI / len;
            const wr = Math.cos(ang);
            const wi = Math.sin(ang);
            const half = len >> 1;
            for (let i = 0; i < n; i += len) {
                let cr = 1, ci = 0;
                for (let k = 0; k < half; k++) {
                    const a = i + k;
                    const b = a + half;
                    const xr = re[b] * cr - im[b] * ci;
                    const xi = re[b] * ci + im[b] * cr;
                    re[b] = re[a] - xr; im[b] = im[a] - xi;
                    re[a] += xr; im[a] += xi;
                    const ncr = cr * wr - ci * wi;
                    ci = cr * wi + ci * wr;
                    cr = ncr;
                }
            }
        }
    }

    /* ==========================================================
       音訊分析
       channels   : Float32Array 陣列（每個聲道一個）
       sampleRate : 取樣率
    ========================================================== */
    function analyzeAudio(channels, sampleRate) {
        // 1. 混成單聲道並降頻到約 22 kHz
        const factor = Math.max(1, Math.round(sampleRate / 22050));
        const sr = sampleRate / factor;
        const srcLen = channels[0].length;
        const len = Math.floor(srcLen / factor);
        const mono = new Float32Array(len);
        const chCount = channels.length;
        for (let i = 0; i < len; i++) {
            let sum = 0;
            const base = i * factor;
            for (let c = 0; c < chCount; c++) {
                const ch = channels[c];
                for (let k = 0; k < factor; k++) sum += ch[base + k];
            }
            mono[i] = sum / (factor * chCount);
        }

        // 2. 短時傅立葉轉換
        const N = 1024;
        const HOP = 256;
        const bins = N / 2;
        const maxBin = Math.min(bins, Math.floor(8000 / (sr / N)));
        const frameCount = Math.max(1, Math.floor(len / HOP));
        const frameDt = HOP / sr;

        const win = new Float32Array(N);
        for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);

        const re = new Float64Array(N);
        const im = new Float64Array(N);
        let prev = new Float32Array(maxBin);
        let prevMax = new Float32Array(maxBin);
        let cur = new Float32Array(maxBin);

        const flux = new Float32Array(frameCount);
        const rms = new Float32Array(frameCount);
        const pitch = new Float32Array(frameCount); // 該幀「新出現的聲音」的主要音高（以半音表示）

        const minPitchBin = Math.max(1, Math.floor(80 / (sr / N)));
        const maxPitchBin = Math.min(maxBin - 1, Math.floor(2500 / (sr / N)));

        for (let f = 0; f < frameCount; f++) {
            const center = f * HOP;
            const start = center - N / 2;
            let energy = 0;
            for (let i = 0; i < N; i++) {
                const idx = start + i;
                const s = idx >= 0 && idx < len ? mono[idx] : 0;
                re[i] = s * win[i];
                im[i] = 0;
                energy += s * s;
            }
            rms[f] = Math.sqrt(energy / N);
            fft(re, im);

            for (let k = 0; k < maxBin; k++) {
                const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
                cur[k] = Math.log1p(mag * 20);
            }

            // SuperFlux：與前一幀做頻率方向最大值濾波後的正差值，抑制顫音誤判
            let sum = 0;
            let bestGain = 0;
            let bestBin = 0;
            for (let k = 0; k < maxBin; k++) {
                const d = cur[k] - prevMax[k];
                if (d > 0) {
                    sum += d;
                    if (k >= minPitchBin && k <= maxPitchBin) {
                        // 低頻 bin 的解析度差，略為加權高一點的頻率
                        const w = d * (0.6 + 0.4 * Math.min(1, k / 40));
                        if (w > bestGain) { bestGain = w; bestBin = k; }
                    }
                }
            }
            flux[f] = f === 0 ? 0 : sum / maxBin;
            pitch[f] = bestBin > 0
                ? 69 + 12 * Math.log2((bestBin * sr / N) / 440)
                : NaN;

            for (let k = 0; k < maxBin; k++) {
                const a = cur[k];
                const b = k > 0 ? cur[k - 1] : a;
                const c = k < maxBin - 1 ? cur[k + 1] : a;
                prevMax[k] = Math.max(a, b, c);
            }
            const t = prev; prev = cur; cur = t;
        }

        // 3. 正規化
        const norm = percentile(flux, 0.995) || 1;
        for (let i = 0; i < frameCount; i++) flux[i] = Math.min(1.5, flux[i] / norm);
        const rmsNorm = percentile(rms, 0.99) || 1;
        for (let i = 0; i < frameCount; i++) rms[i] = rms[i] / rmsNorm;

        // 4. 找峰值（類似 librosa.util.peak_pick）
        const preMax = Math.round(0.03 / frameDt);
        const postMax = Math.round(0.03 / frameDt);
        const preAvg = Math.round(0.1 / frameDt);
        const postAvg = Math.round(0.1 / frameDt);
        const delta = 0.035;
        const wait = Math.round(0.03 / frameDt);

        // 前綴和，加速區間平均
        const prefix = new Float64Array(frameCount + 1);
        for (let i = 0; i < frameCount; i++) prefix[i + 1] = prefix[i] + flux[i];
        const avg = (a, b) => {
            const lo = Math.max(0, a);
            const hi = Math.min(frameCount, b);
            return hi > lo ? (prefix[hi] - prefix[lo]) / (hi - lo) : 0;
        };

        // 長時間的平均強度，用來把安靜段落與激烈段落拉到同一個比較基準
        const longWin = Math.round(3 / frameDt);

        const onsets = [];
        let last = -Infinity;
        for (let i = 1; i < frameCount - 1; i++) {
            const v = flux[i];
            let isMax = true;
            for (let k = Math.max(0, i - preMax); k <= Math.min(frameCount - 1, i + postMax); k++) {
                if (flux[k] > v) { isMax = false; break; }
            }
            if (!isMax) continue;
            const localAvg = avg(i - preAvg, i + postAvg + 1);
            if (v < localAvg + delta) continue;
            if (i - last <= wait) continue;
            last = i;

            const context = avg(i - longWin, i + longWin) + 0.02;
            const after = Math.min(frameCount - 1, i + Math.round(0.35 / frameDt));
            const sustain = rms[i] > 0.001 ? rms[after] / rms[i] : 0;

            onsets.push({
                t: refineOnset(mono, sr, i * frameDt),
                strength: v - localAvg,
                relStrength: (v - localAvg) / context,
                loud: rms[i],
                pitch: pitch[i],
                sustain: sustain
            });
        }

        return {
            duration: len / sr,
            frameDt: frameDt,
            onsets: onsets
        };
    }

    /* ----------------------------------------------------------
       精修起音時間：在峰值附近（前 20ms、後 50ms）內，用約 3ms 的小區塊找出
       能量上升最劇烈的位置（幀的解析度只有 11ms，會讓判定不夠準）
    ---------------------------------------------------------- */
    function refineOnset(mono, sr, t) {
        const block = Math.max(16, Math.round(sr * 0.003));
        const from = Math.max(block, Math.round((t - 0.02) * sr));
        const to = Math.min(mono.length - block, Math.round((t + 0.05) * sr));
        if (to <= from) return t;

        let prevE = -1;
        let bestRise = -Infinity;
        let bestPos = -1;
        for (let s = from - block; s < to; s += block) {
            let e = 0;
            for (let k = 0; k < block; k++) {
                const v = mono[s + k];
                e += v * v;
            }
            e = Math.log(e / block + 1e-9);
            if (prevE !== -1 && s >= from) {
                const rise = e - prevE;
                if (rise > bestRise) { bestRise = rise; bestPos = s; }
            }
            prevE = e;
        }
        // 上升不明顯（例如漸強）就維持原本的幀時間
        if (bestPos < 0 || bestRise < 0.35) return t;
        return (bestPos + block / 2) / sr;
    }

    /* ==========================================================
       由分析結果產生譜面
       回傳 [{ t, lane, dur }]，dur > 0 代表長押
    ========================================================== */
    function generateChart(analysis, difficulty, seed) {
        const cfg = DIFFICULTY[difficulty] || DIFFICULTY.normal;
        const rand = mulberry32((seed || 1) * 7919 + difficulty.length * 104729);
        const onsets = analysis.onsets.filter(o => o.t > 0.25 && o.t < analysis.duration - 0.25);

        // 1. 依強度挑選，同時保持最短間隔
        const target = Math.round(analysis.duration * cfg.density);
        const byStrength = onsets
            .map((o, i) => ({ o, i, score: o.relStrength * 0.75 + o.strength * 0.25 }))
            .sort((a, b) => b.score - a.score);

        const taken = new Uint8Array(onsets.length);
        const chosenTimes = [];
        let chosenCount = 0;
        for (const item of byStrength) {
            if (chosenCount >= target) break;
            const t = item.o.t;
            // 二分搜尋檢查最近的已選音符
            let lo = 0, hi = chosenTimes.length;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (chosenTimes[mid] < t) lo = mid + 1; else hi = mid;
            }
            const before = lo > 0 ? chosenTimes[lo - 1] : -Infinity;
            const after = lo < chosenTimes.length ? chosenTimes[lo] : Infinity;
            if (t - before < cfg.minGap || after - t < cfg.minGap) continue;
            chosenTimes.splice(lo, 0, t);
            taken[item.i] = 1;
            chosenCount++;
        }

        const picked = onsets.filter((_, i) => taken[i]);
        if (!picked.length) return [];

        // 2. 軌道分配：以附近 ±4 秒內的音高分佈分成四等分，高音靠右、低音靠左
        const notes = [];
        const pitches = picked.map(o => (Number.isFinite(o.pitch) ? o.pitch : 60));
        let prevLane = -1;
        let prevPitch = 60;
        const laneTimes = new Array(LANES).fill(-Infinity);

        for (let i = 0; i < picked.length; i++) {
            const o = picked[i];
            const p = pitches[i];

            let below = 0, total = 0;
            for (let j = i - 1; j >= 0 && picked[j].t > o.t - 4; j--) { total++; if (pitches[j] < p) below++; else if (pitches[j] === p) below += 0.5; }
            for (let j = i + 1; j < picked.length && picked[j].t < o.t + 4; j++) { total++; if (pitches[j] < p) below++; else if (pitches[j] === p) below += 0.5; }
            const q = total > 0 ? below / total : 0.5;
            let lane = Math.min(LANES - 1, Math.floor(q * LANES));

            // 音高移動方向與軌道移動方向一致，讀譜比較直覺
            if (prevLane >= 0) {
                const dp = p - prevPitch;
                if (Math.abs(dp) >= 1 && lane === prevLane) {
                    lane = clampLane(prevLane + (dp > 0 ? 1 : -1));
                    if (lane === prevLane) lane = clampLane(prevLane + (dp > 0 ? -1 : 1));
                }
            }

            // 避免太密集的同軌連打
            if (o.t - laneTimes[lane] < cfg.jackGap) {
                const options = [];
                for (let l = 0; l < LANES; l++) {
                    if (o.t - laneTimes[l] >= cfg.jackGap) options.push(l);
                }
                if (options.length) {
                    options.sort((a, b) => Math.abs(a - lane) - Math.abs(b - lane) || (rand() - 0.5));
                    lane = options[0];
                }
            }

            notes.push({ t: o.t, lane: lane, dur: 0, src: o });
            laneTimes[lane] = o.t;
            prevLane = lane;
            prevPitch = p;
        }

        // 3. 長押：前後間隔夠長、而且聲音有延續的地方（數量有上限，避免整首都是長押）
        const holdCandidates = [];
        for (let i = 0; i < notes.length; i++) {
            const n = notes[i];
            const next = i + 1 < notes.length ? notes[i + 1].t : analysis.duration;
            const gap = next - n.t;
            if (gap >= cfg.holdGap && n.src.sustain >= 0.55) {
                const dur = Math.min(gap - 0.28, cfg.holdMax);
                if (dur >= 0.45) holdCandidates.push({ n, dur, score: dur * Math.min(1.2, n.src.sustain) });
            }
        }
        holdCandidates.sort((a, b) => b.score - a.score);
        const holdLimit = Math.round(notes.length * cfg.holdRatio);
        for (let k = 0; k < Math.min(holdLimit, holdCandidates.length); k++) {
            holdCandidates[k].n.dur = Math.round(holdCandidates[k].dur * 1000) / 1000;
        }

        // 4. 雙押：在前後都有空間的強拍加上第二個音符
        const chords = [];
        if (cfg.chordRatio > 0) {
            const candidates = notes
                .map((n, i) => ({ n, i }))
                .filter(({ n, i }) => {
                    const prevT = i > 0 ? notes[i - 1].t : -Infinity;
                    const nextT = i + 1 < notes.length ? notes[i + 1].t : Infinity;
                    return n.dur === 0 && n.t - prevT >= cfg.minGap * 1.8 && nextT - n.t >= cfg.minGap * 1.8;
                })
                .sort((a, b) => b.n.src.relStrength - a.n.src.relStrength);
            const count = Math.round(notes.length * cfg.chordRatio);
            for (let k = 0; k < Math.min(count, candidates.length); k++) {
                const { n, i } = candidates[k];
                const near = [];
                if (i > 0 && n.t - (notes[i - 1].t + notes[i - 1].dur) < cfg.jackGap) near.push(notes[i - 1].lane);
                if (i + 1 < notes.length && notes[i + 1].t - n.t < cfg.jackGap) near.push(notes[i + 1].lane);
                // 優先選擇距離 2 的軌道（左右手各一），並避開前後音符的軌道
                const options = [0, 1, 2, 3]
                    .filter(l => l !== n.lane)
                    .sort((a, b) =>
                        (near.includes(a) - near.includes(b)) ||
                        (Math.abs(Math.abs(a - n.lane) - 2) - Math.abs(Math.abs(b - n.lane) - 2)));
                chords.push({ t: n.t, lane: options[0], dur: 0 });
            }
        }

        const result = notes
            .map(n => ({ t: Math.round(n.t * 1000) / 1000, lane: n.lane, dur: n.dur }))
            .concat(chords.map(n => ({ t: Math.round(n.t * 1000) / 1000, lane: n.lane, dur: 0 })));
        result.sort((a, b) => a.t - b.t || a.lane - b.lane);
        return result;
    }

    function clampLane(l) {
        return Math.max(0, Math.min(LANES - 1, l));
    }

    const api = {
        LANES: LANES,
        DIFFICULTY: DIFFICULTY,
        analyzeAudio: analyzeAudio,
        generateChart: generateChart,
        mulberry32: mulberry32
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    } else {
        root.RhythmChart = api;
    }
})(typeof window !== "undefined" ? window : globalThis);
