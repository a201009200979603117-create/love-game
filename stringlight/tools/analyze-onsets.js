#!/usr/bin/env node
/* ==========================================================
   弦光：起音分析工具（開發用，不會被遊戲載入）
   ----------------------------------------------------------
   用法：node tools/analyze-onsets.js assets/audio/theme.mp3 > js/songs/theme-onsets.js
   需要 ffmpeg。用頻譜通量（SuperFlux）找出音樂的起音，
   再用 3ms 小區塊精修時間，輸出給 js/songs/theme.js 產生譜面。
========================================================== */
"use strict";

const { execFileSync } = require("child_process");

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


function main() {
    const file = process.argv[2];
    if (!file) {
        console.error("usage: node tools/analyze-onsets.js <audio file>");
        process.exit(1);
    }
    const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "2", "-ar", "44100", "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
    const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
    const n = f.length / 2;
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
    const a = analyzeAudio([L, R], 44100);

    // 精簡成數字陣列：[時間ms, 相對強度x100, 絕對強度x100, 音高, 延音x100]
    const rows = a.onsets.map(o => [
        Math.round(o.t * 1000),
        Math.round(o.relStrength * 100),
        Math.round(o.strength * 100),
        Number.isFinite(o.pitch) ? Math.round(o.pitch) : 0,
        Math.round(Math.min(5, o.sustain) * 100)
    ]);
    process.stdout.write("/* 由 tools/analyze-onsets.js 自動產生，請勿手動修改 */\n");
    process.stdout.write("window.THEME_ONSETS = {\n    duration: " + a.duration.toFixed(3) + ",\n    rows: [\n");
    for (let i = 0; i < rows.length; i += 8) {
        process.stdout.write("        " + rows.slice(i, i + 8).map(r => "[" + r.join(",") + "]").join(",") + (i + 8 < rows.length ? ",\n" : "\n"));
    }
    process.stdout.write("    ]\n};\n");
}

main();
