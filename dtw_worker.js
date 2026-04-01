// dtw_worker.js - 在背景執行緒執行 DTW 比對，不阻塞主執行緒

let referenceGestures = null;
let dtwMatrix = null;

// 統一取樣幀數
const FIXED_FRAMES = 30;

// 將 flat 陣列線性重新取樣到 targetFrames 幀 (Raw points, 84 floats per frame)
function resampleFlat(flat, srcFrames, numPoints, targetFrames) {
  if (srcFrames === targetFrames) return flat;
  const fpf = numPoints * 2; 
  const out = new Float32Array(targetFrames * fpf);
  for (let i = 0; i < targetFrames; i++) {
    const t  = i / (targetFrames - 1) * (srcFrames - 1);
    const f0 = Math.floor(t);
    const f1 = Math.min(f0 + 1, srcFrames - 1);
    const a  = t - f0;
    for (let k = 0; k < fpf; k++) {
      out[i * fpf + k] = flat[f0 * fpf + k] * (1 - a) + flat[f1 * fpf + k] * a;
    }
  }
  return out;
}

// 抽取骨架形狀與腕部軌跡特徵
function extractFeatures(resampledRaw, frames) {
  const VEL_WEIGHT = 5.0; // 放大軌跡的權重，使其影響力與 40 個形狀特徵抗衡
  const features = new Float32Array(frames * 84);
  
  for (let f = 0; f < frames; f++) {
    for (let h = 0; h < 2; h++) {
      const h_offset = h * 42; 
      const in_idx = f * 84 + h_offset;
      const out_idx = f * 84 + h_offset;
      
      const w_x = resampledRaw[in_idx];
      const w_y = resampledRaw[in_idx + 1];
      const mcp_x = resampledRaw[in_idx + 18]; // 第 9 個點: x=18, y=19
      const mcp_y = resampledRaw[in_idx + 19];
      
      if (w_x === 0 && w_y === 0 && mcp_x === 0 && mcp_y === 0) {
        // Hand missing
        for (let k = 0; k < 42; k++) features[out_idx + k] = 0;
        continue;
      }
      
      let scale = Math.sqrt((mcp_x - w_x) ** 2 + (mcp_y - w_y) ** 2);
      if (scale === 0) scale = 0.1;
      
      // 特徵 0~39: 各手指相對於手腕的座標 (形狀特徵)
      for (let i = 1; i <= 20; i++) {
        features[out_idx + (i-1)*2]     = (resampledRaw[in_idx + i*2] - w_x) / scale;
        features[out_idx + (i-1)*2 + 1] = (resampledRaw[in_idx + i*2 + 1] - w_y) / scale;
      }
      
      // 特徵 40~41: 手腕相對於前一幀的移動 (軌跡特徵)
      if (f === 0) {
        features[out_idx + 40] = 0;
        features[out_idx + 41] = 0;
      } else {
        const prev_in = (f - 1) * 84 + h_offset;
        const prev_wx = resampledRaw[prev_in];
        const prev_wy = resampledRaw[prev_in + 1];
        if (prev_wx === 0 && prev_wy === 0) {
          features[out_idx + 40] = 0;
          features[out_idx + 41] = 0;
        } else {
          features[out_idx + 40] = ((w_x - prev_wx) / scale) * VEL_WEIGHT;
          features[out_idx + 41] = ((w_y - prev_wy) / scale) * VEL_WEIGHT;
        }
      }
    }
  }
  return features;
}

function loadGestures(rawData) {
  referenceGestures = {};
  for (const [word, entry] of Object.entries(rawData)) {
    const seqList = entry.sequences || (entry.sequence ? [entry.sequence] : null) || [entry];
    if (!seqList || seqList.length === 0) continue;

    const difficulty = entry.difficulty || 1;
    const refs = [];
    
    for (const seq of seqList) {
      if (!seq || seq.length === 0) continue;
      const frames = seq.length;
      const numPoints = 21;
      const rawFlat = new Float32Array(frames * 84);
      for (let f = 0; f < frames; f++) {
        for (let p = 0; p < numPoints; p++) {
          // 左手
          rawFlat[f * 84 + p * 2]     = seq[f][p].x;
          rawFlat[f * 84 + p * 2 + 1] = seq[f][p].y;
          // 右手
          rawFlat[f * 84 + 42 + p * 2]     = seq[f][21 + p].x;
          rawFlat[f * 84 + 42 + p * 2 + 1] = seq[f][21 + p].y;
        }
      }
      
      const resampledRaw = resampleFlat(rawFlat, frames, numPoints * 2, FIXED_FRAMES);
      const featFlat = extractFeatures(resampledRaw, FIXED_FRAMES);

      // 活動權重 (只看軌跡特徵的變異)
      let move_L = 0;
      let move_R = 0;
      for (let f = 1; f < FIXED_FRAMES; f++) {
        const out_idx_L = f * 84;
        const out_idx_R = f * 84 + 42;
        move_L += Math.sqrt(featFlat[out_idx_L + 40]**2 + featFlat[out_idx_L + 41]**2);
        move_R += Math.sqrt(featFlat[out_idx_R + 40]**2 + featFlat[out_idx_R + 41]**2);
      }

      if (move_L === 0 && move_R === 0) {
        move_L = 1; move_R = 1;
      }

      const w_total = move_L + move_R;
      const ratio_L = move_L / w_total;
      const ratio_R = move_R / w_total;
      
      let weight_L, weight_R;
      
      if (difficulty === 1) {
        if (move_L >= move_R) { weight_L = 1.0; weight_R = 0.0; }
        else { weight_L = 0.0; weight_R = 1.0; }
      } else {
        if (ratio_L < 0.25) { weight_L = 0; weight_R = 1.0; }
        else if (ratio_R < 0.25) { weight_L = 1.0; weight_R = 0; }
        else {
          weight_L = 0.9 * ratio_L + 0.1 * 0.5;
          weight_R = 0.9 * ratio_R + 0.1 * 0.5;
        }
      }
      
      const factor_L = weight_L * 2.0;
      const factor_R = weight_R * 2.0;

      refs.push({ feat: featFlat, frames: FIXED_FRAMES, factor_L, factor_R });
    }

    if (refs.length > 0) {
      referenceGestures[word] = refs;
    }
  }
  dtwMatrix = new Float32Array((FIXED_FRAMES + 1) * (FIXED_FRAMES + 1));
}

function computeDTWCosine(liveFeat, refData) {
  const n = FIXED_FRAMES;
  const m = FIXED_FRAMES;
  const cols = m + 1;

  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= m; j++)
      dtwMatrix[i * cols + j] = Infinity;
  dtwMatrix[0] = 0;

  for (let i = 1; i <= n; i++) {
    const s1_offset = (i - 1) * 84;
    
    // Sakoe-Chiba Band (防止頭尾極端對齊，限制比對的波形長度與結構)
    const windowOffset = 6;
    const j_start = Math.max(1, i - windowOffset);
    const j_end = Math.min(m, i + windowOffset);

    for (let j = j_start; j <= j_end; j++) {
      const ref_offset = (j - 1) * 84;
      
      let dot_L = 0, normLive_L = 0, normRef_L = 0;
      let dot_R = 0, normLive_R = 0, normRef_R = 0;
      
      for (let k = 0; k < 42; k++) {
        dot_L += liveFeat[s1_offset + k] * refData.feat[ref_offset + k];
        normLive_L += liveFeat[s1_offset + k] ** 2;
        normRef_L += refData.feat[ref_offset + k] ** 2;
      }
      for (let k = 42; k < 84; k++) {
        dot_R += liveFeat[s1_offset + k] * refData.feat[ref_offset + k];
        normLive_R += liveFeat[s1_offset + k] ** 2;
        normRef_R += refData.feat[ref_offset + k] ** 2;
      }
      
      let dist_L = 1.0;
      if (normLive_L > 0 && normRef_L > 0) {
        dist_L = 1.0 - (dot_L / Math.sqrt(normLive_L * normRef_L));
      } else if (normLive_L === 0 && normRef_L === 0) {
        dist_L = 0.0;
      }
      
      let dist_R = 1.0;
      if (normLive_R > 0 && normRef_R > 0) {
        dist_R = 1.0 - (dot_R / Math.sqrt(normLive_R * normRef_R));
      } else if (normLive_R === 0 && normRef_R === 0) {
        dist_R = 0.0;
      }
      
      const sum = dist_L * refData.factor_L + dist_R * refData.factor_R;
      
      const prev_match  = dtwMatrix[(i - 1) * cols + (j - 1)];
      const prev_insert = dtwMatrix[(i - 1) * cols + j];
      const prev_del    = dtwMatrix[i * cols + (j - 1)];
      let minPrev = prev_match;
      if (prev_insert < minPrev) minPrev = prev_insert;
      if (prev_del    < minPrev) minPrev = prev_del;
      dtwMatrix[i * cols + j] = sum + minPrev;
    }
  }
  return dtwMatrix[n * cols + m] / n;
}

function swapFeatHands(featFlat) {
  const swapped = new Float32Array(featFlat.length);
  for (let f = 0; f < FIXED_FRAMES; f++) {
    const base = f * 84;
    swapped.set(featFlat.subarray(base + 42, base + 84), base);
    swapped.set(featFlat.subarray(base, base + 42), base + 42);
  }
  return swapped;
}

self.onmessage = function(e) {
  const { type, data } = e.data;

  if (type === 'LOAD_GESTURES') {
    fetch('gestures.json')
      .then(res => res.json())
      .then(rawData => {
        loadGestures(rawData);
        const vocab = [];
        for (const [word, entry] of Object.entries(rawData)) {
          vocab.push({ text: word, difficulty: entry.difficulty || 1 });
        }
        self.postMessage({ type: 'GESTURES_LOADED', vocab });
      })
      .catch(err => console.error('Worker failed to fetch gestures.json:', err));
    return;
  }

  if (type === 'MATCH') {
    if (!referenceGestures) {
      self.postMessage({ type: 'RESULT', match: null, score: Infinity });
      return;
    }

    const { liveFlat: rawLive, liveFrames, activeWords } = data;
    // For Cosine Distance, a good match is around 0.05 to 0.4.
    const threshold = 0.4; 

    const resampledRaw = resampleFlat(rawLive, liveFrames, 42, FIXED_FRAMES);
    const liveFeat = extractFeatures(resampledRaw, FIXED_FRAMES);
    const liveFeat_swapped = swapFeatHands(liveFeat);

    let bestWord  = null;
    let bestScore = Infinity;

    for (const word of activeWords) {
      const refs = referenceGestures[word];
      if (!refs || refs.length === 0) continue;

      let wordBestScore = Infinity;
      for (const ref of refs) {
        const s1 = computeDTWCosine(liveFeat, ref);
        const s2 = computeDTWCosine(liveFeat_swapped, ref);
        const s  = Math.min(s1, s2);
        if (s < wordBestScore) wordBestScore = s;
      }

      if (wordBestScore < bestScore) {
        bestScore = wordBestScore;
        bestWord  = word;
      }
    }

    if (bestScore < threshold) {
      self.postMessage({ type: 'RESULT', match: bestWord, score: bestScore });
    } else {
      self.postMessage({ type: 'RESULT', match: null, score: bestScore });
    }
  }
};

