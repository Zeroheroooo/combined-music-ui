// app.js: 台灣手語學習遊戲 Web 版
// 使用 ONNX Transformer 模型進行手語辨識

// 綁定到 window 上，方便我們在 Console 直接手動呼叫測試
window.testUpload = saveScoreToCloud;
window.testGet = getTop10Scores;

//****************************************************
//*************************
// ☁️ Firebase 排行榜系統初始化 (升級至 12.12.0 最新版)

// 1. 核心大腦 (12.12.0 版)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
// 2. 雲端資料庫 (12.12.0 版) - 這是我們為了排行榜自己加上去的！
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 3. 你的專屬金鑰
const firebaseConfig = {
  apiKey: "AIzaSyCPcZUYi5Q47iE3UpXaM4Zkw90RtD61-tk",
  authDomain: "tsl-rhythm-game.firebaseapp.com",
  projectId: "tsl-rhythm-game",
  storageBucket: "tsl-rhythm-game.firebasestorage.app",
  messagingSenderId: "837614444705",
  appId: "1:837614444705:web:4e11bd9f0b1e7b987dd0e0",
  measurementId: "G-XGHRTP4C43"
};

// 4. 啟動 Firebase 與資料庫
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==========================================
// 📌 功能一：上傳分數到雲端
export async function saveScoreToCloud(playerName, finalScore) {
    try {
        await addDoc(collection(db, "leaderboard"), {
            name: playerName,
            score: finalScore,
            timestamp: serverTimestamp()
        });
        console.log("分數上傳成功！");
    } catch (e) {
        console.error("上傳分數失敗: ", e);
    }
}

// 📌 功能二：抓取全球前 10 名
export async function getTop10Scores() {
    try {
        const q = query(collection(db, "leaderboard"), orderBy("score", "desc"), limit(10));
        const querySnapshot = await getDocs(q);
        
        let leaderboardData = [];
        querySnapshot.forEach((doc) => {
            leaderboardData.push(doc.data());
        });
        return leaderboardData;
    } catch (e) {
        console.error("抓取排行榜失敗: ", e);
        return [];
    }
}
//*************************
//****************************************************

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const scoreEl = document.getElementById('score');
const lifeEl = document.getElementById('life');
const video = document.getElementById('video');
const gestureEl = document.getElementById('gesture');
const progressEl = document.getElementById('progress');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');

let WIDTH = 600;
let HEIGHT = 800;

function resizeCanvasToWindow() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  WIDTH = canvas.width;
  HEIGHT = canvas.height;
}
window.addEventListener('resize', resizeCanvasToWindow);
resizeCanvasToWindow();


// ****************************************************************************
// ****************************************************************************
// 🎵🎵🎵🎵🎵 【音樂對拍系統：變數宣告與檔案防呆解析】 🎵🎵🎵🎵🎵
let musicBeats = [];
let currentBeatIndex = 0;
let isAnalyzing = false;
const AUDIO_OFFSET = 0.08; // 🌟 為了教授要求的 <150ms 誤差校正值
const bgmPlayer = document.getElementById('bgmPlayer');
const audioUpload = document.getElementById('audioUpload');

if (audioUpload) {
    audioUpload.addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (!file) return;

        // 🛑 音樂系統防線一：限制檔案大小 (15 MB)
        const maxSize = 15 * 1024 * 1024; 
        if (file.size > maxSize) {
            alert("請上傳 15MB 以下的音樂檔。");
            e.target.value = ''; return; 
        }

        // 🛑 音樂系統防線二：開始解析時鎖死按鈕
        audioUpload.disabled = true;
        if (startBtn) startBtn.disabled = true; 

        if (statusEl) statusEl.textContent = '狀態: 🎵 音樂解析中...';
        isAnalyzing = true;

        try {
            const fileURL = URL.createObjectURL(file);
            bgmPlayer.src = fileURL;
            const arrayBuffer = await file.arrayBuffer();
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            musicBeats = await analyzeBeatsSmartJS(audioBuffer);
            if (statusEl) statusEl.textContent = `狀態: ✅ 解析完成！載入 ${TARGET_BOMBS} 顆炸彈`;
        } catch (error) {
            console.error("音樂解析失敗:", error);
            alert("這首音樂無法解析，請換一首歌！");
            if (statusEl) statusEl.textContent = '狀態: 音樂解析失敗';
        } finally {
            isAnalyzing = false;
            audioUpload.disabled = false;
            if (startBtn && modelLoaded && gesturesLoaded) startBtn.disabled = false;
        }
    });
}

async function analyzeBeatsSmartJS(audioBuffer) {
    const duration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;
    const offlineCtx = new OfflineAudioContext(3, audioBuffer.length, sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;

    const lowPass = offlineCtx.createBiquadFilter(); lowPass.type = 'lowpass'; lowPass.frequency.value = 150;
    const bandPass = offlineCtx.createBiquadFilter(); bandPass.type = 'bandpass'; bandPass.frequency.value = 1000;
    const highPass = offlineCtx.createBiquadFilter(); highPass.type = 'highpass'; highPass.frequency.value = 3000;

    const merger = offlineCtx.createChannelMerger(3);
    source.connect(lowPass).connect(merger, 0, 0);
    source.connect(bandPass).connect(merger, 0, 1);
    source.connect(highPass).connect(merger, 0, 2);
    merger.connect(offlineCtx.destination);
    source.start(0);
    const renderedBuffer = await offlineCtx.startRendering(); 

    function getOnsetEvents(channelData, lane, targetMin, targetMax) {
        const windowSize = Math.floor(sampleRate * 0.05); 
        const stepSize = Math.floor(sampleRate * 0.01);   
        let energy = [];
        for (let i = 0; i < channelData.length - windowSize; i += stepSize) {
            let sum = 0;
            for (let j = 0; j < windowSize; j++) sum += channelData[i+j] * channelData[i+j];
            energy.push(Math.sqrt(sum / windowSize));
        }
        const maxE = Math.max(...energy); const minE = Math.min(...energy);
        const normEnergy = energy.map(e => (e - minE) / (maxE - minE + 1e-6));
        let threshold = 0.35; let events = [];
        for (let attempt = 0; attempt < 6; attempt++) {
            events = [];
            for (let i = 1; i < normEnergy.length - 1; i++) {
                if (normEnergy[i] > threshold && normEnergy[i] > normEnergy[i-1] && normEnergy[i] > normEnergy[i+1]) {
                    events.push({ time: i * (0.01), lane: lane });
                }
            }
            let bps = events.length / duration;
            if (bps < targetMin) threshold -= 0.08;
            else if (bps > targetMax) threshold += 0.06;
            else break;
            threshold = Math.max(0.05, Math.min(threshold, 0.8));
        }
        return events;
    }

    const eventsLow = getOnsetEvents(renderedBuffer.getChannelData(0), 0, 0.5, 1.0);
    const eventsMid = getOnsetEvents(renderedBuffer.getChannelData(1), 1, 0.5, 1.0);
    const eventsHigh = getOnsetEvents(renderedBuffer.getChannelData(2), 2, 0.5, 1.0);
    let allEvents = [...eventsLow, ...eventsMid, ...eventsHigh];
    allEvents.sort((a, b) => a.time - b.time);

    let filteredEvents = []; let lastBombTime = -999.0;
    for (let ev of allEvents) {
        if (ev.time - lastBombTime >= 3.0) {
            filteredEvents.push(ev); lastBombTime = ev.time;
        }
    }
    
    let finalEvents = [];
    if (filteredEvents.length > 0) {
        finalEvents.push(filteredEvents[0]);
        for (let i = 1; i < filteredEvents.length; i++) {
            let prevTime = finalEvents[finalEvents.length - 1].time;
            let curr = filteredEvents[i];
            while (curr.time - prevTime > 5.0) {
                let fillerTime = prevTime + 3.0;
                if (curr.time - fillerTime < 1.0) break;
                finalEvents.push({ time: fillerTime, lane: Math.floor(Math.random() * 3) });
                prevTime = fillerTime;
            }
            finalEvents.push(curr);
        }
    }
    TARGET_BOMBS = finalEvents.length; 
    return finalEvents;
}
// 🎵🎵🎵🎵🎵 【音樂對拍系統：解析引擎結束】 🎵🎵🎵🎵🎵
// ****************************************************************************
// ****************************************************************************


// -----------------------
// 遊戲狀態
// -----------------------
let score = 0;
let bombs = [];
let frameCounter = 0;

const HOUSE_COUNT = 10;
const HOUSE_WIDTH = 120;
const HOUSE_HEIGHT = 80;
const HOUSE_MARGIN_BOTTOM = 20;
let houses = [];

let plane = null;
let totalBombsDropped = 0;
const MIN_ACTIVE_BOMBS = 2;
// ****************************************************************************
// ****************************************************************************
// 💥 【音樂系統更動】：把 const 改成了 let，因為音樂會動態改變炸彈總數
let TARGET_BOMBS = 15; 
// ****************************************************************************
// ****************************************************************************
let minBombReplenishDelay = 150;
let minBombReplenishCounter = 100;

let gameOver = false;
let win = false;
let gameStarted = false;
let gamePaused = false;

let isProcessingFrame = false;

// -----------------------
// ONNX 模型辨識系統
// -----------------------
let ortSession = null;
let labelMap = null;
let predictionBuffer = [];
const PREDICTION_BUFFER_SIZE = 5;   // 隊友規格：紀錄最近 5 次預測
const STABLE_COUNT = 4;             // 隊友規格：5 次中至少 4 次一致
const CONFIDENCE_THRESHOLD = 0.75;  // 隊友規格：原始 logit 門檻
const MODEL_FRAMES = 30;
const FEATURE_DIM = 138;
let modelLoaded = false;

// Debug: 儲存最近一次推論的完整結果供畫面顯示
let lastDebugInfo = null;

// 詞彙難度對照表（可自由調整）
const WORD_DIFFICULTY = {
  '棒': 1, '謝謝': 1, '高興': 1, '喜歡': 1,
  '名字': 2, '對不起': 2, '生氣': 2, '沒關係': 2,
  '不客氣': 3, '飛機': 3,
};

let fullVocabulary = [];
let currentVocabulary = [{ text: '載入中...', difficulty: 1 }];
let gesturesLoaded = false;

function updateDifficultySelection() {
  const diffSelect = document.getElementById('difficulty-select');
  const selectedDifficulty = diffSelect ? diffSelect.value : 'all';

  if (selectedDifficulty === 'all') {
    currentVocabulary = fullVocabulary.length > 0 ? [...fullVocabulary] : [{ text: '無資料', difficulty: 1 }];
  } else {
    const diffInt = parseInt(selectedDifficulty, 10);
    const filtered = fullVocabulary.filter(v => v.difficulty === diffInt);
    currentVocabulary = filtered.length > 0 ? filtered : (fullVocabulary.length > 0 ? [...fullVocabulary] : [{ text: '無資料', difficulty: 1 }]);
  }
}

const difficultySelect = document.getElementById('difficulty-select');
if (difficultySelect) {
  difficultySelect.addEventListener('change', updateDifficultySelection);
}

async function initModel() {
  try {
    statusEl.textContent = '狀態: 正在載入 AI 模型...';
    ortSession = await ort.InferenceSession.create('./tsl_model.onnx');
    const response = await fetch('./10_label_map.json');
    labelMap = await response.json();
    console.log('ONNX model loaded', labelMap);

    fullVocabulary = Object.entries(labelMap).map(([idx, text]) => ({
      text,
      difficulty: WORD_DIFFICULTY[text] || 1,
    }));
    currentVocabulary = [...fullVocabulary];
    modelLoaded = true;
    gesturesLoaded = true;
    updateDifficultySelection();

    // ****************************************************************************
    // ****************************************************************************
    // 💥 【音樂系統更動】：防呆避免蓋掉音樂解析狀態
    if (!isAnalyzing) statusEl.textContent = '狀態: AI 模型載入完成';
  } catch (e) {
    console.error('Model init failed:', e);
    statusEl.textContent = '狀態: AI 模型載入失敗 - ' + e.message;
  }
}

// -----------------------
// 圖片資源
// -----------------------
const backgroundImg = new Image();
backgroundImg.src = 'background.png';

const houseImg = new Image();
houseImg.src = 'house.png';

const planeImg = new Image();
planeImg.src = 'plane.png';

const bombImg = new Image();
bombImg.src = 'bomb.png';

const explosionImg = new Image();
explosionImg.src = 'explosion.png';

function randomVocab() {
  return currentVocabulary[Math.floor(Math.random() * currentVocabulary.length)];
}

// -----------------------
// 飛機與炸彈
// -----------------------
class Plane {
  constructor() {
    this.width = 120; this.height = 50;
    this.x = 0; this.y = 50;
    this.speed = 3; this.direction = 1;
    this.dropCooldown = 150;
  }
  move() {
    this.x += this.speed * this.direction;
    // 飛機碰到右上角的攝像頭區域時回頭 (320×180 尺寸，位於右上角)
    const cameraWidth = 320;
    const videoAreaLeft = WIDTH - cameraWidth - 10;
    if (this.x + this.width >= videoAreaLeft) { this.x = videoAreaLeft - this.width; this.direction = -1; }
    else if (this.x <= 0) { this.x = 0; this.direction = 1; }
    if (this.dropCooldown > 0) this.dropCooldown -= 1;
  }
    // ****************************************************************************
    // delete maybeDropBomb()
    // ****************************************************************************
  render(ctx) {
    if (planeImg.complete && planeImg.naturalWidth > 0) {
      const imgH = this.height;
      const imgW = (planeImg.naturalWidth / planeImg.naturalHeight) * imgH;
      const drawX = this.x + (this.width - imgW) / 2;
      ctx.save();
      if (this.direction === -1) { ctx.translate(drawX + imgW / 2, 0); ctx.scale(-1, 1); ctx.translate(-(drawX + imgW / 2), 0); }
      ctx.drawImage(planeImg, drawX, this.y, imgW, imgH);
      ctx.restore();
    } else {
      ctx.fillStyle = '#999';
      ctx.fillRect(this.x, this.y, this.width, this.height);
    }
  }
}

class Bomb {
  static WIDTH = 100; static HEIGHT = 100;
  static SPEED = 1.5; static MAX_SHRINK_TIME = 15;
// ****************************************************************************
// ****************************************************************************
// 【音樂對拍系統：為炸彈加入完美掉落時間參數】 + targetTime
  constructor(x, y, targetTime) { 
    this.x = x ?? Math.random() * (WIDTH - Bomb.WIDTH);
    this.y = y ?? -Bomb.HEIGHT;
    this.y = this.startY;//0420 
    // ****************************************************************************
    // ****************************************************************************
    this.targetTime = targetTime; // 🌟 為了誤差測量儲存目標時間
    this.spawnTime = spawnTime;//0420
    // ****************************************************************************
    // ****************************************************************************
    this.word = randomVocab().text;
    this.shrinking = false; this.shrinkTimer = 0;
    this.exploding = false; this.explosionTimer = 0;
    this.shouldExplode = false; this.finished = false; this.impactResolved = false;
    this.houseDamageApplied = false;  // 標記房子傷害是否已應用
  }
  // ****************************************************************************
  // ***************************************
  fall(currentTime) {
    if (!this.shrinking && !this.exploding){
      // 絕對時間同步公式：經過的時間 * 每秒應掉落的像素 (SPEED * 60幀)
        const elapsedTime = currentTime - this.spawnTime;
        this.y = this.startY + elapsedTime * (Bomb.SPEED * 60);
    }
  }
  // ***************************************
  // ****************************************************************************
  startShrink(shouldExplode = false) {
    if (this.exploding) return;
    this.shrinking = true; this.shrinkTimer = 0;
    this.shouldExplode = shouldExplode; this.impactResolved = true;
  }
  render(ctx) {
    if (this.finished) return;
    let drawX = this.x, drawY = this.y, drawW = Bomb.WIDTH, drawH = Bomb.HEIGHT;

    if (this.shrinking) {
      this.shrinkTimer += 1;
      const ratio = 1 - this.shrinkTimer / Bomb.MAX_SHRINK_TIME;
      if (ratio > 0) {
        drawW = Bomb.WIDTH * ratio; drawH = Bomb.HEIGHT * ratio;
        drawX = this.x + (Bomb.WIDTH - drawW) / 2; drawY = this.y + (Bomb.HEIGHT - drawH) / 2;
      } else {
        this.shrinking = false;
        if (this.shouldExplode) { this.exploding = true; this.explosionTimer = 0; }
        else { this.finished = true; }
      }
    }
    if (this.exploding) {
      this.explosionTimer += 1;
      const size = Bomb.WIDTH * 1.3;
      const ex = this.x + (Bomb.WIDTH - size) / 2, ey = this.y + (Bomb.HEIGHT - size) / 2;
      if (explosionImg.complete && explosionImg.naturalWidth > 0) ctx.drawImage(explosionImg, ex, ey, size, size);
      else { ctx.fillStyle = 'orange'; ctx.beginPath(); ctx.arc(this.x + Bomb.WIDTH / 2, this.y + Bomb.HEIGHT / 2, size / 2, 0, Math.PI * 2); ctx.fill(); }
      if (this.explosionTimer >= 10) { this.exploding = false; this.finished = true; }
      return;
    }
    if (bombImg.complete && bombImg.naturalWidth > 0) ctx.drawImage(bombImg, drawX, drawY, drawW, drawH);
    else { ctx.fillStyle = '#CC0000'; ctx.fillRect(drawX, drawY, drawW, drawH); }
    ctx.fillStyle = '#FFF'; ctx.font = '24px Arial'; ctx.textAlign = 'center';
    ctx.fillText(this.word, this.x + Bomb.WIDTH / 2, this.y + Bomb.HEIGHT / 2 + 10);
  }
}

// -----------------------
// 手勢偵測系統（ONNX 模型）
// -----------------------
let lastHandLandmarks = null;
let lastVideoFrame = null;
let handMissFrameCount = 0;  // 計數連續缺失的幀數
const HAND_PERSISTENCE_FRAMES = 30;  // 手部節點持續顯示 30 幀（約 0.5 秒）後才清除

let featureBuffer = [];
const FEATURE_BUFFER_MAX = 30;
const MIN_FRAMES_FOR_INFERENCE = 30;
let inferenceCooldown = 0;
let isInferring = false;
let handMissCount = 0;
let handWasPresent = false;

function resetGestureSequence() {
  featureBuffer = [];
  predictionBuffer = [];
  inferenceCooldown = 0;
  isInferring = false;
  handWasPresent = false;
  handMissCount = 0;
  handMissFrameCount = 0;  // 重置手部節點持久化計數
  if (progressEl) progressEl.textContent = '進度: 等待手勢...';
}

async function runInference() {
  if (!ortSession || isInferring || featureBuffer.length < MIN_FRAMES_FOR_INFERENCE) return null;
  isInferring = true;
  try {
    const inputData = prepareModelInput(featureBuffer, MODEL_FRAMES);
    const tensor = new ort.Tensor('float32', inputData, [1, MODEL_FRAMES, FEATURE_DIM]);
    const results = await ortSession.run({ input: tensor });
    const output = Array.from(results.output.data);

    // 取得當前難度允許的詞彙清單
    const activeWords = new Set(currentVocabulary.map(v => v.text));

    // 建立 label index → word 對照，並遮蔽非當前難度的 logits
    const maskedLogits = output.map((logit, i) => {
      const word = labelMap[String(i)];
      return activeWords.has(word) ? logit : -Infinity;
    });

    // 找最大 logit（只在允許的類別中）
    const maxLogit = Math.max(...maskedLogits);
    const predIdx = maskedLogits.indexOf(maxLogit);
    const predLabel = labelMap[String(predIdx)];

    // Debug: 記錄所有類別的原始 logits
    const allPreds = [];
    for (let i = 0; i < output.length; i++) {
      const word = labelMap[String(i)] || `?${i}`;
      const active = activeWords.has(word);
      allPreds.push({ label: word, logit: output[i], active });
    }
    allPreds.sort((a, b) => b.logit - a.logit);
    lastDebugInfo = {
      top5: allPreds.filter(p => p.active).slice(0, 5).map(p => ({
        label: p.label, prob: p.logit
      })),
      bufferLen: featureBuffer.length,
      rawLogits: output.map(x => x.toFixed(2)),
    };
    const topActive = allPreds.filter(p => p.active).slice(0, 3);
    console.log(`[推論] 緩衝=${featureBuffer.length}幀 | Top(該難度): ${topActive.map(p => `${p.label}(${p.logit.toFixed(2)})`).join(', ')}`);
    
    // 診斷: 所有logits都很低时的警告
    const maxLogitAll = Math.max(...output);
    if (maxLogitAll < 0.1) {
      console.warn('[警告] 所有logits都很低 (<0.1)，检查:', {
        buffer帧数: featureBuffer.length,
        所有logits: output.map(x => x.toFixed(4)).join(','),
      });
    }

    isInferring = false;
    // 使用原始 logit 值（不做 softmax），跟隊友的 checkGesture 一致
    return { label: predLabel, confidence: maxLogit };
  } catch (e) {
    console.error('Inference error:', e);
    isInferring = false;
    return null;
  }
}

function processInferenceResult(result) {
  if (!result) return;
  if (gestureEl) gestureEl.textContent = `偵測: ${result.label} (logit: ${result.confidence.toFixed(2)})`;

  // 原始 logit 門檻 0.75（跟隊友的 checkGesture 一致）
  if (result.confidence < CONFIDENCE_THRESHOLD) {
    console.log(`[過濾] ${result.label} logit=${result.confidence.toFixed(2)} < 門檻 ${CONFIDENCE_THRESHOLD}`);
    return;
  }

  // 連續判定邏輯 (5 次中至少 4 次一致)
  predictionBuffer.push(result.label);
  if (predictionBuffer.length > PREDICTION_BUFFER_SIZE) predictionBuffer.shift();

  const counts = {};
  predictionBuffer.forEach(x => counts[x] = (counts[x] || 0) + 1);
  const stableLabel = Object.keys(counts).find(key => counts[key] >= STABLE_COUNT);
  console.log(`[緩衝] ${predictionBuffer.join(',')} | 穩定=${stableLabel || '無'}`);

  if (stableLabel && gameStarted && !gameOver) {
    for (let b of bombs) {
      if (b.word === stableLabel && !b.shrinking && !b.exploding) {
        console.log(`[成功] 消除炸彈: ${stableLabel}`);
        b.startShrink(false);
        inferenceCooldown = 30;
        featureBuffer = [];
        predictionBuffer = [];
        if (progressEl) progressEl.textContent = `進度: 辨識成功 (${stableLabel})`;
        break;
      }
    }
  }
}

function updateDynamicGesture(results) {
  if (inferenceCooldown > 0) inferenceCooldown--;
  const hasHand = results && (results.leftHandLandmarks || results.rightHandLandmarks);

  if (!hasHand) {
    handMissCount++;
    handMissFrameCount++;  // 累加缺失幀數
    // 只有在連續缺失超過設定幀數才清除手部節點
    if (handMissFrameCount > HAND_PERSISTENCE_FRAMES) {
      lastHandLandmarks = null;  // 只現在才真正清除
      featureBuffer = [];
    }
    if (handMissCount < 5) return;
    if (handWasPresent && featureBuffer.length >= MIN_FRAMES_FOR_INFERENCE &&
      !isInferring && inferenceCooldown <= 0 && bombs.length > 0) {
      runInference().then(r => processInferenceResult(r));
    }
    handWasPresent = false;
    if (progressEl && inferenceCooldown <= 0) progressEl.textContent = '進度: 等待手勢...';
    return;
  }

  // 檢測到手時重置計數
  handMissCount = 0;
  handMissFrameCount = 0;  // 重置缺失計數
  handWasPresent = true;
  
  if (typeof extractFrame138 === 'function') {
      const frame = extractFrame138(results);
      
      // 诊断：检查特征是否全为0或其他异常值
      const nonZeroCount = frame.filter(v => Math.abs(v) > 1e-6).length;
      if (featureBuffer.length === 0 && nonZeroCount < 10) {
        console.warn('[特征提取] 非零值过少:', nonZeroCount, '个，特征可能有问题');
        console.log('[特征样本]', {
          leftHand: frame.slice(0, 9).map(x => x.toFixed(3)).join(','),
          rightHand: frame.slice(63, 72).map(x => x.toFixed(3)).join(','),
          global: frame.slice(126, 138).map(x => x.toFixed(3)).join(','),
          诊断信息: typeof lastFeatureDiag !== 'undefined' ? lastFeatureDiag : '无',
        });
      }
      
      featureBuffer.push(frame);
      if (featureBuffer.length > FEATURE_BUFFER_MAX) featureBuffer.shift();
      if (progressEl) progressEl.textContent = `進度: 錄製動作 (${featureBuffer.length}/${FEATURE_BUFFER_MAX})`;

      if (featureBuffer.length >= MIN_FRAMES_FOR_INFERENCE &&
        !isInferring && inferenceCooldown <= 0 && bombs.length > 0) {
        if (featureBuffer.length % 10 === 0 || featureBuffer.length >= FEATURE_BUFFER_MAX) {
          runInference().then(r => processInferenceResult(r));
        }
      }
  } else {
      console.warn("找不到 extractFrame138 函數，請確保它在其他檔案或全域中定義。");
  }
}

// -----------------------
// 房子
// -----------------------
function initHouses() {
  houses = [];
  const attemptsLimit = 5000;
  let attempts = 0;
  while (houses.length < HOUSE_COUNT && attempts < attemptsLimit) {
    const x = Math.random() * (WIDTH - HOUSE_WIDTH);
    const y = HEIGHT - HOUSE_HEIGHT - HOUSE_MARGIN_BOTTOM;
    const rect = { x, y, width: HOUSE_WIDTH, height: HOUSE_HEIGHT };
    let dup = false;
    for (const h of houses) { if (Math.abs(h.x - rect.x) < 1 && Math.abs(h.y - rect.y) < 1) { dup = true; break; } }
    if (!dup) houses.push(rect);
    attempts++;
  }
  while (houses.length < HOUSE_COUNT) {
    houses.push({ x: 50 + houses.length * (HOUSE_WIDTH + 10), y: HEIGHT - HOUSE_HEIGHT - HOUSE_MARGIN_BOTTOM, width: HOUSE_WIDTH, height: HOUSE_HEIGHT });
  }
}

function updateHud() {
  scoreEl.textContent = `房子數: ${houses.length}`;
  lifeEl.textContent = `已掉落: ${totalBombsDropped}/${TARGET_BOMBS}`;

// ****************************************************************************
// ***************************************
  if (isAnalyzing) {
    statusEl.textContent = '狀態: 🎵 音樂解析中，請稍候...';
  } else if (!gameStarted) {
    if (musicBeats.length > 0) {
      statusEl.textContent = `狀態: ✅ 載入 ${TARGET_BOMBS} 顆炸彈 (按開始遊戲)`;
    } else {
      statusEl.textContent = modelLoaded ? '狀態: 準備中 (請先上傳音樂)' : '狀態: 正在載入模型...';
    }
// ***************************************
// ****************************************************************************
    
    if (startBtn) {
      startBtn.style.display = (modelLoaded && gesturesLoaded) ? 'block' : 'none';
      startBtn.textContent = '開始遊戲';
    }
    if (pauseBtn) pauseBtn.style.display = 'none';
  } else if (gameOver) {
    statusEl.textContent = win ? '狀態: 勝利！' : '狀態: 失敗';
    if (startBtn) {
      startBtn.style.display = 'block';
      startBtn.textContent = '重新開始';
    }
    if (pauseBtn) pauseBtn.style.display = 'none';
  } else if (gamePaused) {
    statusEl.textContent = '狀態: 暫停中';
    if (startBtn) startBtn.style.display = 'none';
    if (pauseBtn) {
      pauseBtn.style.display = 'block';
      pauseBtn.textContent = '繼續';
    }
  } else {
    statusEl.textContent = '狀態: 遊玩中';
    if (startBtn) startBtn.style.display = 'none';
    if (pauseBtn) {
      pauseBtn.style.display = 'block';
      pauseBtn.textContent = '暫停';
    }
  }
}

// -----------------------
// 繪製攝影機畫面與手部節點（所有狀態都顯示）
// -----------------------
let camVideoAspect = 16/9;  // 1280x720 的實際比例

function renderCamera() {
  // 計算正確的顯示尺寸（保持16:9比例）
  const camMaxW = 320;  // 回復為 320 像素
  const camMaxH = 180;
  let camW = camMaxW;
  let camH = camW / camVideoAspect;
  if (camH > camMaxH) {
    camH = camMaxH;
    camW = camH * camVideoAspect;
  }
  // 放在右上角
  const camX = WIDTH - camW - 10, camY = 10;

  // 鏡像繪製攝影機畫面
  if (lastVideoFrame) {
    ctx.save();
    ctx.translate(camX + camW, camY);
    ctx.scale(-1, 1);
    ctx.drawImage(lastVideoFrame, 0, 0, camW, camH);
    ctx.restore();
  }

  // 綠色邊框
  ctx.strokeStyle = '#0f0';
  ctx.lineWidth = 2;
  ctx.strokeRect(camX, camY, camW, camH);

  // 繪製手部節點（鏡像，使用實際顯示尺寸）
  if (lastHandLandmarks && lastHandLandmarks.length > 0) {
    ctx.fillStyle = '#0f0';
    for (const hand of lastHandLandmarks) {
      for (const lm of hand) {
        const x = camX + (1 - lm.x) * camW;
        const y = camY + lm.y * camH;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// -----------------------
// Debug 資訊疊加層（顯示模型推論 + 特徵診斷）
// -----------------------
// 儲存最近一次的特徵診斷
let lastFeatureDiag = null;

function renderDebugOverlay() {
  const x = 10, y = HEIGHT - 320;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(x, y, 420, 310);
  ctx.fillStyle = '#0f0';
  ctx.font = '13px monospace';
  ctx.textAlign = 'left';

  let ly = y + 18;
  ctx.fillText(`[Buffer] ${featureBuffer.length}/${FEATURE_BUFFER_MAX} | [Hand] ${handWasPresent ? 'YES' : 'NO'} | [CD] ${inferenceCooldown}`, x + 8, ly);
  ly += 18;
  ctx.fillText(`[Smooth] ${predictionBuffer.join(',') || '(空)'} (需${STABLE_COUNT}/${PREDICTION_BUFFER_SIZE}次)`, x + 8, ly);

  // 特徵診斷區
  ly += 22;
  ctx.fillStyle = '#0ff';
  ctx.fillText('=== 特徵診斷 ===', x + 8, ly);
  if (lastFeatureDiag) {
    const d = lastFeatureDiag;
    ly += 16;
    ctx.fillStyle = d.hasPose ? '#0f0' : '#f00';
    ctx.fillText(`Pose: ${d.hasPose ? '✓' : '✗'}`, x + 8, ly);
    ctx.fillStyle = d.hasFace ? '#0f0' : '#f00';
    ctx.fillText(`Face: ${d.hasFace ? '✓' : '✗'}`, x + 80, ly);
    ctx.fillStyle = d.hasLeft ? '#0f0' : '#f88';
    ctx.fillText(`左手: ${d.hasLeft ? '✓' : '✗'}`, x + 150, ly);
    ctx.fillStyle = d.hasRight ? '#0f0' : '#f88';
    ctx.fillText(`右手: ${d.hasRight ? '✓' : '✗'}`, x + 230, ly);
    ly += 16;
    ctx.fillStyle = '#888';
    ctx.font = '11px monospace';
    ctx.fillText(`零值 L:${d.lhZeros}/63 R:${d.rhZeros}/63`, x + 8, ly);
  } else {
    ly += 16;
    ctx.fillStyle = '#888';
    ctx.fillText('等待偵測...', x + 8, ly);
    ly += 32;
  }

  // 模型預測區
  ly += 16;
  if (lastDebugInfo) {
    ctx.fillStyle = '#ff0';
    ctx.font = '13px monospace';
    ctx.fillText(`=== 預測 (門檻${CONFIDENCE_THRESHOLD}) ===`, x + 8, ly);
    lastDebugInfo.top5.slice(0, 3).forEach((p, i) => {
      ly += 16;
      const barW = Math.max(0, (p.prob + 3) * 20);
      ctx.fillStyle = (i === 0 && p.prob >= CONFIDENCE_THRESHOLD) ? '#0f0' : '#555';
      ctx.fillRect(x + 140, ly - 12, barW, 12);
      ctx.fillStyle = '#fff';
      ctx.fillText(`${p.label}: ${p.prob.toFixed(1)}`, x + 8, ly);
    });
    ly += 12;
    ctx.fillStyle = '#666';
    ctx.font = '10px monospace';
    ctx.fillText(`logits: ${lastDebugInfo.rawLogits.join(',')}`, x + 8, ly);
  } else {
    ctx.fillStyle = '#888';
    ctx.fillText('尚未進行推論', x + 8, ly);
  }
}

// ********************************************************************************
//*****************************************
// 🎮 遊戲結束處理函數
// ==========================================
// 🎮 遊戲結束處理函數 (加強版)
// ==========================================
// ==========================================
// 🎮 遊戲結束處理函數 (加強版 + 華麗排行榜 UI)
// ==========================================
function handleGameOver(isWin) {
    console.log("🚨 成功觸發結算函數！準備停止音樂與上傳分數..."); 

    // 1. 停止背景音樂
    try {
        const bgm = document.getElementById('bgmPlayer');
        if (bgm && !bgm.paused) {
            bgm.pause();
            bgm.currentTime = 0;
        }
    } catch (e) {
        console.log("音樂停止失敗，但沒關係繼續結算：", e);
    }

    // 2. 計算最後分數
    const finalScore = isWin ? 9999 : 10; // 👈 這裡記得換成你真正的分數變數喔！
    
    // 3. 延遲 0.5 秒後跳出輸入名字視窗
    setTimeout(() => {
        const message = isWin ? "🎉 恭喜過關！" : "💥 遊戲失敗！";
        const playerName = prompt(`${message} 你的分數是 ${finalScore}，請輸入大名登入排行榜：`, "神秘玩家");
        
        // 4. 如果有輸入名字，就上傳並顯示華麗排行榜
        if (playerName) {
            console.log(`準備上傳 -> 玩家: ${playerName}, 分數: ${finalScore}`);
            
            // 呼叫 Firebase 上傳分數
            saveScoreToCloud(playerName, finalScore).then(() => {
                
                // 上傳完畢後，抓取最新前 10 名
                getTop10Scores().then(top10 => {
                    
                    // --- 👇 這裡就是把 Console 變成畫面的魔法 👇 ---
                    const modal = document.getElementById('leaderboard-modal');
                    const listContainer = document.getElementById('leaderboard-list');
                    listContainer.innerHTML = ''; // 先清空舊名單
                    
                    // 跑迴圈把前 10 名塞進 HTML 裡
                    top10.forEach((player, index) => {
                        // 給前三名加個超炫獎牌
                        let medal = '';
                        if (index === 0) medal = '🥇';
                        else if (index === 1) medal = '🥈';
                        else if (index === 2) medal = '🥉';
                        else medal = `<span style="display:inline-block; width:25px;">${index + 1}.</span>`;

                        // 塞入 HTML 條目
                        listContainer.innerHTML += `
                            <li style="display: flex; justify-content: space-between; padding: 10px 5px; border-bottom: 1px dashed #444; font-size: 18px;">
                                <span style="font-weight: bold;">${medal} ${player.name}</span>
                                <span style="color: #ff0;">${player.score} 分</span>
                            </li>
                        `;
                    });

                    // 把隱藏的排行榜視窗顯示出來 (flex 可以讓它置中)
                    modal.style.display = 'flex';
                    // --- 👆 魔法結束 👆 ---

                });
            });
        } else {
            console.log("玩家取消輸入名字，不上傳分數。");
        }
    }, 500);
}
//******************************************
//***************************************************************************************
// -----------------------
// 主迴圈
// -----------------------
function gameLoop() {
  // 继续计数手部被检测到的时间，确保每帧都更新（即使 predictWebcam 延迟）
  if (handMissFrameCount > 0) {
    handMissFrameCount++;
    if (handMissFrameCount > HAND_PERSISTENCE_FRAMES) {
      lastHandLandmarks = null;
    }
  }

  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  if (!gameStarted) {
    if (backgroundImg.complete && backgroundImg.naturalWidth > 0) ctx.drawImage(backgroundImg, 0, 0, WIDTH, HEIGHT);
    else { ctx.fillStyle = '#003366'; ctx.fillRect(0, 0, WIDTH, HEIGHT); }
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // ★ 遊戲開始前也顯示攝影機 + 手部節點
    renderCamera();
    renderDebugOverlay();

    ctx.fillStyle = '#FFF'; ctx.font = '48px Arial'; ctx.textAlign = 'center';
    if (!gesturesLoaded || !modelLoaded) {
      ctx.fillText('正在載入模型，請稍候...', WIDTH / 2, Math.max(HEIGHT / 2, 50));
    // ****************************************************************************
    // ***************************************
    } else if (musicBeats.length === 0) {
      // 💥 【音樂系統提示】
      ctx.fillText('請先在左上角上傳音樂', WIDTH / 2, Math.max(HEIGHT / 2, 50));
    // ***************************************
    // ****************************************************************************
    }
    updateHud();
    requestAnimationFrame(gameLoop);
    return;
  }

  frameCounter += 1;

  if (backgroundImg.complete && backgroundImg.naturalWidth > 0) ctx.drawImage(backgroundImg, 0, 0, WIDTH, HEIGHT);
  else { ctx.fillStyle = '#003366'; ctx.fillRect(0, 0, WIDTH, HEIGHT); }

  // ★ 遊戲中也顯示攝影機 + 手部節點
  renderCamera();

  if (!gameOver && !gamePaused) {
    plane.move();

    // ****************************************************************************
    // ***************************************
    // 【音樂對拍系統：未來視精準掉落邏輯】
    let currentTime = bgmPlayer.currentTime + AUDIO_OFFSET; 
    let dropDistance = HEIGHT - HOUSE_HEIGHT - 150; 
    let travelTime = dropDistance / (Bomb.SPEED * 60); 
    let lookAheadTime = currentTime + travelTime;

    while (currentBeatIndex < musicBeats.length && lookAheadTime >= musicBeats[currentBeatIndex].time) {
        let targetLane = musicBeats[currentBeatIndex].lane;
        let usableWidth = WIDTH - 320; 
        let laneX = (usableWidth / 3) * targetLane + (usableWidth / 6) - (Bomb.WIDTH / 2);

        plane.x = laneX; 
        
        let targetTime = musicBeats[currentBeatIndex].time;
        let spawnTime = targetTime - travelTime;
        let timeOverdue = currentTime - spawnTime;
        let offsetY = Math.max(0, timeOverdue * (Bomb.SPEED * 60));
        
        const dropY = plane.y + plane.height - 30 + offsetY;
        bombs.push(new Bomb(laneX, dropY, targetTime, spawnTime)); //0420
        
        totalBombsDropped += 1;
        currentBeatIndex += 1; 
    } 
    //【音樂掉落系統結束】
    // ***************************************
    // ****************************************************************************
  }

  // 房子
  for (const h of houses) {
    if (houseImg.complete && houseImg.naturalWidth > 0) ctx.drawImage(houseImg, h.x, h.y, h.width, h.height);
    else { ctx.fillStyle = '#ffaa00'; ctx.fillRect(h.x, h.y, h.width, h.height); }
  }

  // 炸彈
  if (!gameOver) {
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i];
      if (!gamePaused) b.fall(bgmPlayer.currentTime + AUDIO_OFFSET);//0420
      b.render(ctx);
      const bombBottom = b.y + Bomb.HEIGHT;
      // 只有碰到地面才爆炸，忽略房子碰撞
      const hitGround = bombBottom >= HEIGHT;
      
      if (!b.impactResolved && !b.shrinking && !b.exploding && hitGround) {
        
        // ****************************************************************************
        // ***************************************
        // 【我的音樂對拍系統：150ms 誤差測量雷達】
        if (b.targetTime !== undefined) {
            let error = Math.abs((bgmPlayer.currentTime + AUDIO_OFFSET) - b.targetTime);
            console.log(`[誤差測試] 目標: ${b.targetTime.toFixed(3)}s | 實際(含校正): ${(bgmPlayer.currentTime + AUDIO_OFFSET).toFixed(3)}s | 誤差: ${error.toFixed(3)} 秒`);
        }
        // ***************************************
        // ****************************************************************************

        b.impactResolved = true;  // 標記已接觸
        b.shouldExplode = true;
        b.startShrink(true);  // 開始爆炸縮小動畫
      }

      // 爆炸動畫完成後再消除最近的房子
      if (b.finished && b.shouldExplode && !b.houseDamageApplied) {
        b.houseDamageApplied = true;
        if (houses.length > 0) {
          // 找到距離炸弹爆炸點最近的房子
          let closestIdx = 0;
          let closestDist = Infinity;
          const bombCenterX = b.x + Bomb.WIDTH / 2;
          const bombCenterY = b.y + Bomb.HEIGHT / 2;
          for (let i = 0; i < houses.length; i++) {
            const h = houses[i];
            const houseCenterX = h.x + h.width / 2;
            const houseCenterY = h.y + h.height / 2;
            const dist = Math.hypot(houseCenterX - bombCenterX, houseCenterY - bombCenterY);
            if (dist < closestDist) {
              closestDist = dist;
              closestIdx = i;
            }
          }
          houses.splice(closestIdx, 1);
          if (houses.length === 0) { gameOver = true; win = false; handleGameOver(false); }
        }
      }
      if (!b.shrinking && !b.exploding && (b.finished || b.shrinkTimer > Bomb.MAX_SHRINK_TIME)) bombs.splice(i, 1);
    }
    // 🏆 判定勝利的條件
    if (!gameOver && totalBombsDropped >= TARGET_BOMBS && bombs.length === 0 && houses.length > 0) { 
        gameOver = true; 
        win = true; 
        handleGameOver(true); // 呼叫結算函數，傳入 true 代表勝利
    }
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = win ? '#00ff00' : '#ff0000'; ctx.font = '48px Arial'; ctx.textAlign = 'center';
    ctx.fillText(win ? '勝利！' : '失敗', WIDTH / 2, HEIGHT / 2 - 20);
  }

  // 顯示暫停畫面
  if (gamePaused) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#FFF'; ctx.font = '60px Arial'; ctx.textAlign = 'center';
    ctx.fillText('暫停', WIDTH / 2, HEIGHT / 2 - 40);
  }

  plane.render(ctx);
  renderDebugOverlay();
  updateHud();
  requestAnimationFrame(gameLoop);
}

// -----------------------
// MediaPipe Hand 引擎 (Tasks Vision API)
// -----------------------
let handLandmarker = null;
let lastVideoTime = -1;

async function initWebcam() {
  statusEl.textContent = '狀態: 正在載入 Tasks Vision 引擎...';

  try {
    // 使用 ES Module Dynamic Import 載入 @mediapipe/tasks-vision
    const visionModule = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs");
    const { FilesetResolver: FR, HandLandmarker: HL } = visionModule;

    statusEl.textContent = '狀態: 正在載入 Hand 模型...';

    const filesetResolver = await FR.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    );

    handLandmarker = await HL.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 2,  // 同時檢測二隻手
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    console.log("[Hand] HandLandmarker 建立成功 (Tasks Vision API)");

    // 開啟攝影機 (要求 16:9 以匹配訓練影片的比例，避免特徵變形)
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 }
    });
    video.srcObject = stream;
    await video.play();
    lastVideoFrame = video;
    statusEl.textContent = '狀態: 已連線攝像頭（可進行手勢偵測）';
    predictWebcam();

  } catch (error) {
    console.error("Hand initialization failed:", error);
    statusEl.textContent = '狀態: Hand 載入失敗 - ' + error.message;
  }
}

let lastPredictTime = 0;
const PREDICT_FRAME_INTERVAL = 33;  // 30 FPS (改善手部同步)
async function predictWebcam() {
  if (!handLandmarker) return;

  // 確認影片播放中
  if (video.currentTime === lastVideoTime) {
    requestAnimationFrame(predictWebcam);
    return;
  }

  // 限制推論幀率約 30 FPS (每 33ms 執行一次) 改善手部節點同步
  const now = performance.now();
  if (now - lastPredictTime < PREDICT_FRAME_INTERVAL) {
    requestAnimationFrame(predictWebcam);
    return;
  }

  lastPredictTime = now;
  lastVideoTime = video.currentTime;

  try {
    const startTimeMs = performance.now();
    const results = handLandmarker.detectForVideo(video, startTimeMs);

    // Hand Landmarker 返回的是一個或兩個手的書蹟
    let leftHandLandmarks = null;
    let rightHandLandmarks = null;
    
    if (results.landmarks && results.landmarks.length > 0) {
      if (results.handedness && results.handedness.length > 0) {
        // 根據 handedness 的位置區分左手和右手
        for (let i = 0; i < results.landmarks.length; i++) {
          const handedness = results.handedness[i][0].categoryName; // 'Left' or 'Right'
          if (handedness === 'Left') {
            leftHandLandmarks = results.landmarks[i];
          } else if (handedness === 'Right') {
            rightHandLandmarks = results.landmarks[i];
          }
        }
      }
    }

    // 格式轉換以相容舊的 results 格式 (用於除錯顯示與特徵提取)
    const formattedResults = {
      poseLandmarks: null,  // Hand Landmarker 不會返回體態
      faceLandmarks: null,  // Hand Landmarker 不會返回臉部
      leftHandLandmarks: leftHandLandmarks,
      rightHandLandmarks: rightHandLandmarks,
    };
    
    // 诊断：检查HandLandmarker返回的数据格式
    if (results.landmarks && results.landmarks.length > 0) {
      const sampleLm = results.landmarks[0];
      if (sampleLm && sampleLm.length > 0) {
        const firstPoint = sampleLm[0];
        if (typeof firstPoint.x !== 'number' || typeof firstPoint.y !== 'number') {
          console.warn('[警告] HandLandmarker格式异常:', {
            firstPoint: firstPoint,
            keys: Object.keys(firstPoint),
          });
        }
      }
    }

    const handList = [];
    if (formattedResults.leftHandLandmarks) handList.push(formattedResults.leftHandLandmarks);
    if (formattedResults.rightHandLandmarks) handList.push(formattedResults.rightHandLandmarks);
    lastHandLandmarks = handList.length > 0 ? handList : null;

    updateDynamicGesture(formattedResults);
    lastVideoFrame = video;
  } catch (e) {
    console.error("Detection error:", e);
  }

  requestAnimationFrame(predictWebcam);
}

// -----------------------
// 初始化
// -----------------------
function initGame() {
  initHouses();
  plane = new Plane();

  // 移除鍵盤事件，改用按鈕

  // 開始遊戲按鈕
  if (startBtn) {
    startBtn.addEventListener('click', () => {

    // ****************************************************************************
    // ***************************************
    // 【我的音樂對拍系統：防呆控制與播放連動】
      if (musicBeats.length === 0 || isAnalyzing) {
        alert("請先上傳音樂並等待解析完成喔！");
        return; 
      }

      if (!gameStarted) {
        if (!gesturesLoaded || !modelLoaded) return;
        gameStarted = true;
        gamePaused = false;
        bgmPlayer.play(); // 🌟 音樂連動：播放*********************************
        updateHud();
      } else if (gameOver) {
        gameStarted = true; gameOver = false; win = false; gamePaused = false;
        bombs = []; totalBombsDropped = 0; currentBeatIndex = 0;
        initHouses(); plane = new Plane();
        resetGestureSequence();
        bgmPlayer.currentTime = 0; // 🌟 音樂連動：歸零***********************
        bgmPlayer.play();          // 🌟 音樂連動：播放***********************
        updateHud();
      }
    });
  }

  // 暫停按鈕
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      if (gameStarted && !gameOver) {
        gamePaused = !gamePaused;
        if (gamePaused) {
            bgmPlayer.pause(); // 🌟 音樂連動：暫停音樂***************************
        } else {
            bgmPlayer.play();  // 🌟 音樂連動：恢復音樂***************************
        }
        updateHud();
      }
    });
  }

  //**************************
  //********
  const closeBoardBtn = document.getElementById('close-leaderboard-btn');
  if (closeBoardBtn) {
      closeBoardBtn.addEventListener('click', () => {
          // 隱藏排行榜
          document.getElementById('leaderboard-modal').style.display = 'none';
          // 觸發重新開始的邏輯
          if (startBtn) startBtn.click(); 
      });
  }
  //********
  //**************************

  updateHud();
  requestAnimationFrame(gameLoop);
}

initModel();
initWebcam().catch(() => { statusEl.textContent = '狀態: 無法存取攝影機（仍可遊玩）'; });
initGame();
