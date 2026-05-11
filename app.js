// app.js: 台灣手語學習遊戲 Web 版
// 使用 ONNX Transformer 模型進行手語辨識

// 🚨 修正：所有的 import 必須放在檔案的最上方！
// ☁️ Firebase 排行榜系統初始化
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp, getCountFromServer, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 綁定到 window 上，方便我們在 Console 直接手動呼叫測試
window.testUpload = saveScoreToCloud;
window.testGet = getTop10Scores;

const firebaseConfig = {
  apiKey: "AIzaSyCPcZUYi5Q47iE3UpXaM4Zkw90RtD61-tk",
  authDomain: "tsl-rhythm-game.firebaseapp.com",
  projectId: "tsl-rhythm-game",
  storageBucket: "tsl-rhythm-game.firebasestorage.app",
  messagingSenderId: "837614444705",
  appId: "1:837614444705:web:4e11bd9f0b1e7b987dd0e0",
  measurementId: "G-XGHRTP4C43"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function saveScoreToCloud(playerName, finalScore) {
    try {
        await addDoc(collection(db, "leaderboard"), { name: playerName, score: finalScore, timestamp: serverTimestamp() });
        console.log("分數上傳成功！");
    } catch (e) { console.error("上傳分數失敗: ", e); }
}

export async function getTop10Scores() {
    try {
        const q = query(collection(db, "leaderboard"), orderBy("score", "desc"), limit(10));
        const querySnapshot = await getDocs(q);
        let leaderboardData = [];
        querySnapshot.forEach((doc) => { leaderboardData.push(doc.data()); });
        return leaderboardData;
    } catch (e) { return []; }
}

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const scoreEl = document.getElementById('score');
const lifeEl = document.getElementById('life');
const video = document.getElementById('video');
const gestureEl = document.getElementById('gesture');
const progressEl = document.getElementById('progress');

const musicSelectionUI = document.getElementById('musicSelectionUI');
const defaultMusicBtn = document.getElementById('defaultMusicBtn');
const parsingStatus = document.getElementById('parsingStatus');
const actionBtn = document.getElementById('actionBtn');
const audioUpload = document.getElementById('audioUpload');

let WIDTH = 600; let HEIGHT = 800;
function resizeCanvasToWindow() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; WIDTH = canvas.width; HEIGHT = canvas.height; }
window.addEventListener('resize', resizeCanvasToWindow);
resizeCanvasToWindow();

// 🌟 自訂 Alert 函式 (取代預設彈窗)
function showCustomAlert(msg) {
    document.getElementById('alertMessage').textContent = msg;
    document.getElementById('customAlertUI').style.display = 'flex';
}
document.getElementById('closeAlertBtn').addEventListener('click', () => {
    document.getElementById('customAlertUI').style.display = 'none';
});

// 🎵 音樂系統
let musicBeats = []; let currentBeatIndex = 0; let isAnalyzing = false;
const AUDIO_OFFSET = 0.08; 
const bgmPlayer = document.getElementById('bgmPlayer');

async function processAudioData(arrayBuffer, sourceURL) {
    isAnalyzing = true;
    if (parsingStatus) parsingStatus.textContent = '🎵 音樂解析中，請稍候...';
    if (statusEl) statusEl.textContent = '狀態: 🎵 音樂解析中...';
    try {
        bgmPlayer.src = sourceURL;
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        musicBeats = await analyzeBeatsSmartJS(audioBuffer);
        
        if (parsingStatus) parsingStatus.textContent = `✅ 解析完成！載入 ${TARGET_BOMBS} 顆炸彈`;
        if (statusEl) statusEl.textContent = `狀態: ✅ 解析完成！`;
        
        setTimeout(() => {
            if (musicSelectionUI) musicSelectionUI.style.display = 'none';
            if (actionBtn) {
                actionBtn.style.display = 'block'; actionBtn.className = 'center-state';
                if (!modelLoaded || !gesturesLoaded) {
                    actionBtn.textContent = 'AI 模型載入中...'; actionBtn.style.backgroundColor = '#999'; actionBtn.disabled = true;
                } else {
                    actionBtn.textContent = '開始遊戲'; actionBtn.style.backgroundColor = '#0f0'; actionBtn.disabled = false;
                }
            }
        }, 800);
    } catch (error) {
        showCustomAlert("音樂格式不正確或解析失敗，請換一首歌試試！");
        if (parsingStatus) parsingStatus.textContent = '';
        if (audioUpload) audioUpload.disabled = false;
        if (defaultMusicBtn) defaultMusicBtn.disabled = false;
    } finally { isAnalyzing = false; }
}

if (audioUpload) {
    audioUpload.addEventListener('change', async function(e) {
        const file = e.target.files[0]; if (!file) return;
        if (file.size > 15 * 1024 * 1024) { showCustomAlert("請上傳 15MB 以下的音樂檔。"); e.target.value = ''; return; }
        if (defaultMusicBtn) defaultMusicBtn.disabled = true; audioUpload.disabled = true;
        const arrayBuffer = await file.arrayBuffer();
        const fileURL = URL.createObjectURL(file);
        await processAudioData(arrayBuffer, fileURL);
    });
}

if (defaultMusicBtn) {
    defaultMusicBtn.addEventListener('click', async function() {
        if (defaultMusicBtn) defaultMusicBtn.disabled = true;
        if (audioUpload) audioUpload.disabled = true; 
        try {
            const response = await fetch('./default_track.mp3');
            if (!response.ok) throw new Error("找不到檔案");
            const arrayBuffer = await response.arrayBuffer();
            await processAudioData(arrayBuffer, './default_track.mp3');
        } catch (err) {
            showCustomAlert("找不到預設音樂檔 (default_track.mp3)，請使用本地上傳！");
            if (defaultMusicBtn) defaultMusicBtn.disabled = false;
            if (audioUpload) audioUpload.disabled = false;
        }
    });
}

async function analyzeBeatsSmartJS(audioBuffer) {
    const duration = audioBuffer.duration; const sampleRate = audioBuffer.sampleRate;
    const OfflineCtxConstructor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const offlineCtx = new OfflineCtxConstructor(3, audioBuffer.length, sampleRate);
    const source = offlineCtx.createBufferSource(); source.buffer = audioBuffer;
    const lowPass = offlineCtx.createBiquadFilter(); lowPass.type = 'lowpass'; lowPass.frequency.value = 150;
    const bandPass = offlineCtx.createBiquadFilter(); bandPass.type = 'bandpass'; bandPass.frequency.value = 1000;
    const highPass = offlineCtx.createBiquadFilter(); highPass.type = 'highpass'; highPass.frequency.value = 3000;
    const merger = offlineCtx.createChannelMerger(3);
    source.connect(lowPass).connect(merger, 0, 0); source.connect(bandPass).connect(merger, 0, 1); source.connect(highPass).connect(merger, 0, 2);
    merger.connect(offlineCtx.destination); source.start(0);
    const renderedBuffer = await offlineCtx.startRendering(); 

    function getOnsetEvents(channelData, lane, targetMin, targetMax) {
        const windowSize = Math.floor(sampleRate * 0.05); const stepSize = Math.floor(sampleRate * 0.01);   
        let energy = [];
        for (let i = 0; i < channelData.length - windowSize; i += stepSize) {
            let sum = 0; for (let j = 0; j < windowSize; j++) sum += channelData[i+j] * channelData[i+j];
            energy.push(Math.sqrt(sum / windowSize));
        }
        const maxE = Math.max(...energy); const minE = Math.min(...energy);
        const normEnergy = energy.map(e => (e - minE) / (maxE - minE + 1e-6));
        let threshold = 0.35; let events = [];
        for (let attempt = 0; attempt < 6; attempt++) {
            events = [];
            for (let i = 1; i < normEnergy.length - 1; i++) {
                if (normEnergy[i] > threshold && normEnergy[i] > normEnergy[i-1] && normEnergy[i] > normEnergy[i+1]) { events.push({ time: i * (0.01), lane: lane }); }
            }
            let bps = events.length / duration;
            if (bps < targetMin) threshold -= 0.08; else if (bps > targetMax) threshold += 0.06; else break;
            threshold = Math.max(0.05, Math.min(threshold, 0.8));
        }
        return events;
    }

    const eventsLow = getOnsetEvents(renderedBuffer.getChannelData(0), 0, 0.5, 1.0);
    const eventsMid = getOnsetEvents(renderedBuffer.getChannelData(1), 1, 0.5, 1.0);
    const eventsHigh = getOnsetEvents(renderedBuffer.getChannelData(2), 2, 0.5, 1.0);
    let allEvents = [...eventsLow, ...eventsMid, ...eventsHigh]; allEvents.sort((a, b) => a.time - b.time);
    let filteredEvents = []; let lastBombTime = -999.0;
    for (let ev of allEvents) { if (ev.time - lastBombTime >= 3.0) { filteredEvents.push(ev); lastBombTime = ev.time; } }
    
    let finalEvents = [];
    if (filteredEvents.length > 0) {
        finalEvents.push(filteredEvents[0]);
        for (let i = 1; i < filteredEvents.length; i++) {
            let prevTime = finalEvents[finalEvents.length - 1].time; let curr = filteredEvents[i];
            while (curr.time - prevTime > 5.0) {
                let fillerTime = prevTime + 3.0; if (curr.time - fillerTime < 1.0) break;
                finalEvents.push({ time: fillerTime, lane: Math.floor(Math.random() * 3) }); prevTime = fillerTime;
            }
            finalEvents.push(curr);
        }
    }
    TARGET_BOMBS = finalEvents.length; return finalEvents;
}

// -----------------------
// 遊戲狀態
// -----------------------
let score = 0; let hitCount = 0; let bombs = []; let frameCounter = 0;
const HOUSE_COUNT = 10; const HOUSE_WIDTH = 120; const HOUSE_HEIGHT = 80; const HOUSE_MARGIN_BOTTOM = 20;
let houses = []; let plane = null; let totalBombsDropped = 0; const MIN_ACTIVE_BOMBS = 2; let TARGET_BOMBS = 15; 
let gameOver = false; let win = false; let gameStarted = false; let gamePaused = false;

// -----------------------
// ONNX 模型辨識系統
// -----------------------
let ortSession = null; let labelMap = null; let predictionBuffer = [];
const PREDICTION_BUFFER_SIZE = 5; const STABLE_COUNT = 4; const CONFIDENCE_THRESHOLD = 0.75;  
const MODEL_FRAMES = 30; const FEATURE_DIM = 138;
let modelLoaded = false; let lastDebugInfo = null;

const WORD_DIFFICULTY = { '棒': 1, '謝謝': 1, '高興': 1, '喜歡': 1, '名字': 2, '對不起': 2, '生氣': 2, '沒關係': 2, '不客氣': 3, '飛機': 3 };
let fullVocabulary = []; let currentVocabulary = [{ text: '載入中...', difficulty: 1 }]; let gesturesLoaded = false;

function updateDifficultySelection() {
  const diffSelect = document.getElementById('difficulty-select'); const selectedDifficulty = diffSelect ? diffSelect.value : 'all';
  if (selectedDifficulty === 'all') { currentVocabulary = fullVocabulary.length > 0 ? [...fullVocabulary] : [{ text: '無資料', difficulty: 1 }]; } 
  else {
    const diffInt = parseInt(selectedDifficulty, 10); const filtered = fullVocabulary.filter(v => v.difficulty === diffInt);
    currentVocabulary = filtered.length > 0 ? filtered : (fullVocabulary.length > 0 ? [...fullVocabulary] : [{ text: '無資料', difficulty: 1 }]);
  }
}

document.getElementById('difficulty-select')?.addEventListener('change', updateDifficultySelection);

async function initModel() {
  try {
    statusEl.textContent = '狀態: 正在載入 AI 模型...';
    ortSession = await ort.InferenceSession.create('./tsl_model.onnx');
    const response = await fetch('./10_label_map.json'); labelMap = await response.json();
    fullVocabulary = Object.entries(labelMap).map(([idx, text]) => ({ text, difficulty: WORD_DIFFICULTY[text] || 1 }));
    currentVocabulary = [...fullVocabulary]; modelLoaded = true; gesturesLoaded = true; updateDifficultySelection();
    if (!isAnalyzing) statusEl.textContent = '狀態: AI 模型載入完成';
  } catch (e) { statusEl.textContent = '狀態: AI 模型載入失敗 - ' + e.message; }
}

// -----------------------
// 圖片與物件
// -----------------------
const backgroundImg = new Image(); backgroundImg.src = 'background.png';
const houseImg = new Image(); houseImg.src = 'house.png';
const planeImg = new Image(); planeImg.src = 'plane.png';
const bombImg = new Image(); bombImg.src = 'bomb.png';
const explosionImg = new Image(); explosionImg.src = 'explosion.png';

function randomVocab() { return currentVocabulary[Math.floor(Math.random() * currentVocabulary.length)]; }

class Plane {
  constructor() { this.width = 120; this.height = 50; this.x = 0; this.y = 50; this.speed = 7; this.direction = 1; }
  move() {
    this.x += this.speed * this.direction; const videoAreaLeft = WIDTH - 330;
    if (this.x + this.width >= videoAreaLeft) { this.x = videoAreaLeft - this.width; this.direction = -1; } 
    else if (this.x <= 0) { this.x = 0; this.direction = 1; }
  }
  render(ctx) {
    if (planeImg.complete && planeImg.naturalWidth > 0) {
      const imgH = this.height; const imgW = (planeImg.naturalWidth / planeImg.naturalHeight) * imgH;
      const drawX = this.x + (this.width - imgW) / 2; ctx.save();
      if (this.direction === -1) { ctx.translate(drawX + imgW / 2, 0); ctx.scale(-1, 1); ctx.translate(-(drawX + imgW / 2), 0); }
      ctx.drawImage(planeImg, drawX, this.y, imgW, imgH); ctx.restore();
    } else { ctx.fillStyle = '#999'; ctx.fillRect(this.x, this.y, this.width, this.height); }
  }
}

class Bomb {
  static WIDTH = 100; static HEIGHT = 100; static SPEED = 1.5; static MAX_SHRINK_TIME = 15;
  constructor(x, y, targetTime, spawnTime) { 
    this.x = x ?? Math.random() * (WIDTH - Bomb.WIDTH); this.startY = y ?? -Bomb.HEIGHT; this.y = this.startY;
    this.targetTime = targetTime; this.spawnTime = spawnTime; this.word = randomVocab().text;
    this.shrinking = false; this.shrinkTimer = 0; this.exploding = false; this.explosionTimer = 0;
    this.shouldExplode = false; this.finished = false; this.impactResolved = false; this.houseDamageApplied = false;  
  }
  fall(currentTime) { if (!this.shrinking && !this.exploding) this.y = this.startY + (currentTime - this.spawnTime) * (Bomb.SPEED * 60); }
  startShrink(shouldExplode = false) { if (this.exploding) return; this.shrinking = true; this.shrinkTimer = 0; this.shouldExplode = shouldExplode; this.impactResolved = true; }
  render(ctx) {
    if (this.finished) return;
    let drawX = this.x, drawY = this.y, drawW = Bomb.WIDTH, drawH = Bomb.HEIGHT;
    if (this.shrinking) {
      this.shrinkTimer += 1; const ratio = 1 - this.shrinkTimer / Bomb.MAX_SHRINK_TIME;
      if (ratio > 0) { drawW = Bomb.WIDTH * ratio; drawH = Bomb.HEIGHT * ratio; drawX = this.x + (Bomb.WIDTH - drawW) / 2; drawY = this.y + (Bomb.HEIGHT - drawH) / 2; } 
      else { this.shrinking = false; if (this.shouldExplode) { this.exploding = true; this.explosionTimer = 0; } else this.finished = true; }
    }
    if (this.exploding) {
      this.explosionTimer += 1; const size = Bomb.WIDTH * 1.3; const ex = this.x + (Bomb.WIDTH - size) / 2, ey = this.y + (Bomb.HEIGHT - size) / 2;
      if (explosionImg.complete && explosionImg.naturalWidth > 0) ctx.drawImage(explosionImg, ex, ey, size, size);
      else { ctx.fillStyle = 'orange'; ctx.beginPath(); ctx.arc(this.x + Bomb.WIDTH / 2, this.y + Bomb.HEIGHT / 2, size / 2, 0, Math.PI * 2); ctx.fill(); }
      if (this.explosionTimer >= 10) { this.exploding = false; this.finished = true; } return;
    }
    if (bombImg.complete && bombImg.naturalWidth > 0) ctx.drawImage(bombImg, drawX, drawY, drawW, drawH); else { ctx.fillStyle = '#CC0000'; ctx.fillRect(drawX, drawY, drawW, drawH); }
    
    // 🌟 R4: 美化炸彈字體
    ctx.fillStyle = '#FFF'; 
    ctx.font = 'bold 28px "Microsoft JhengHei", "Noto Sans TC", sans-serif'; 
    ctx.textAlign = 'center';
    ctx.fillText(this.word, this.x + Bomb.WIDTH / 2, this.y + Bomb.HEIGHT / 2 + 10);
  }
}

// -----------------------
// 手勢偵測邏輯
// -----------------------
let lastHandLandmarks = null; let lastVideoFrame = null; let handMissFrameCount = 0; const HAND_PERSISTENCE_FRAMES = 30;  
let featureBuffer = []; const FEATURE_BUFFER_MAX = 30; const MIN_FRAMES_FOR_INFERENCE = 30; let inferenceCooldown = 0; let isInferring = false; let handMissCount = 0; let handWasPresent = false;

function resetGestureSequence() { featureBuffer = []; predictionBuffer = []; inferenceCooldown = 0; isInferring = false; handWasPresent = false; handMissCount = 0; handMissFrameCount = 0; if (progressEl) progressEl.textContent = '進度: 等待手勢...'; }

async function runInference() {
  if (!ortSession || isInferring || featureBuffer.length < MIN_FRAMES_FOR_INFERENCE) return null;
  isInferring = true;
  try {
    const inputData = prepareModelInput(featureBuffer, MODEL_FRAMES); const tensor = new ort.Tensor('float32', inputData, [1, MODEL_FRAMES, FEATURE_DIM]);
    const results = await ortSession.run({ input: tensor }); const output = Array.from(results.output.data);
    const activeWords = new Set(currentVocabulary.map(v => v.text));
    const maskedLogits = output.map((logit, i) => { const word = labelMap[String(i)]; return activeWords.has(word) ? logit : -Infinity; });
    const maxLogit = Math.max(...maskedLogits); const predIdx = maskedLogits.indexOf(maxLogit); const predLabel = labelMap[String(predIdx)];
    
    const allPreds = [];
    for (let i = 0; i < output.length; i++) { const word = labelMap[String(i)] || `?${i}`; const active = activeWords.has(word); allPreds.push({ label: word, logit: output[i], active }); }
    allPreds.sort((a, b) => b.logit - a.logit); lastDebugInfo = { top5: allPreds.filter(p => p.active).slice(0, 5).map(p => ({ label: p.label, prob: p.logit })), bufferLen: featureBuffer.length, rawLogits: output.map(x => x.toFixed(2)), };
    isInferring = false; return { label: predLabel, confidence: maxLogit };
  } catch (e) { isInferring = false; return null; }
}

function processInferenceResult(result) {
  if (!result) return; if (gestureEl) gestureEl.textContent = `偵測: ${result.label} (logit: ${result.confidence.toFixed(2)})`;
  if (result.confidence < CONFIDENCE_THRESHOLD) return;
  predictionBuffer.push(result.label); if (predictionBuffer.length > PREDICTION_BUFFER_SIZE) predictionBuffer.shift();
  const counts = {}; predictionBuffer.forEach(x => counts[x] = (counts[x] || 0) + 1);
  const stableLabel = Object.keys(counts).find(key => counts[key] >= STABLE_COUNT);
  if (stableLabel && gameStarted && !gameOver) {
    for (let b of bombs) {
      if (b.word === stableLabel && !b.shrinking && !b.exploding) {
        b.startShrink(false); hitCount++; inferenceCooldown = 30; featureBuffer = []; predictionBuffer = [];
        if (progressEl) progressEl.textContent = `進度: 辨識成功 (${stableLabel})`; break;
      }
    }
  }
}

function updateDynamicGesture(results) {
  if (inferenceCooldown > 0) inferenceCooldown--;
  const hasHand = results && (results.leftHandLandmarks || results.rightHandLandmarks);
  if (!hasHand) {
    handMissCount++; handMissFrameCount++; 
    if (handMissFrameCount > HAND_PERSISTENCE_FRAMES) { lastHandLandmarks = null; featureBuffer = []; }
    if (handMissCount < 5) return;
    if (handWasPresent && featureBuffer.length >= MIN_FRAMES_FOR_INFERENCE && !isInferring && inferenceCooldown <= 0 && bombs.length > 0) { runInference().then(r => processInferenceResult(r)); }
    handWasPresent = false; if (progressEl && inferenceCooldown <= 0) progressEl.textContent = '進度: 等待手勢...'; return;
  }
  handMissCount = 0; handMissFrameCount = 0; handWasPresent = true;
  if (typeof extractFrame138 === 'function') {
      const frame = extractFrame138(results); featureBuffer.push(frame);
      if (featureBuffer.length > FEATURE_BUFFER_MAX) featureBuffer.shift();
      if (progressEl) progressEl.textContent = `進度: 錄製動作 (${featureBuffer.length}/${FEATURE_BUFFER_MAX})`;
      if (featureBuffer.length >= MIN_FRAMES_FOR_INFERENCE && !isInferring && inferenceCooldown <= 0 && bombs.length > 0) {
        if (featureBuffer.length % 10 === 0 || featureBuffer.length >= FEATURE_BUFFER_MAX) { runInference().then(r => processInferenceResult(r)); }
      }
  }
}

function initHouses() {
  houses = []; let attempts = 0;
  while (houses.length < HOUSE_COUNT && attempts < 5000) {
    const x = Math.random() * (WIDTH - HOUSE_WIDTH); const y = HEIGHT - HOUSE_HEIGHT - HOUSE_MARGIN_BOTTOM; const rect = { x, y, width: HOUSE_WIDTH, height: HOUSE_HEIGHT };
    let dup = false; for (const h of houses) { if (Math.abs(h.x - rect.x) < 1 && Math.abs(h.y - rect.y) < 1) { dup = true; break; } }
    if (!dup) houses.push(rect); attempts++;
  }
  while (houses.length < HOUSE_COUNT) { houses.push({ x: 50 + houses.length * (HOUSE_WIDTH + 10), y: HEIGHT - HOUSE_HEIGHT - HOUSE_MARGIN_BOTTOM, width: HOUSE_WIDTH, height: HOUSE_HEIGHT }); }
}

function updateHud() {
  scoreEl.textContent = `房子數: ${houses.length}`; lifeEl.textContent = `已掉落: ${totalBombsDropped}/${TARGET_BOMBS}`;
  if (isAnalyzing) { statusEl.textContent = '狀態: 🎵 音樂解析中，請稍候...'; } 
  else if (!gameStarted) {
    if (musicBeats.length > 0) {
      statusEl.textContent = `狀態: ✅ 載入 ${TARGET_BOMBS} 顆炸彈`;
      if (modelLoaded && gesturesLoaded && actionBtn && actionBtn.disabled && (!musicSelectionUI || musicSelectionUI.style.display === 'none')) { actionBtn.textContent = '開始遊戲'; actionBtn.style.backgroundColor = '#0f0'; actionBtn.disabled = false; }
    } else { statusEl.textContent = modelLoaded ? '狀態: 準備中 (請選擇音樂)' : '狀態: 正在載入 AI 模型...'; }
  } 
  else if (gameOver) { statusEl.textContent = win ? '狀態: 勝利！' : '狀態: 失敗'; } 
  else if (gamePaused) { statusEl.textContent = '狀態: 暫停中'; } 
  else { statusEl.textContent = '狀態: 遊玩中'; }
}

let camVideoAspect = 16/9; 
function renderCamera() {
  const camMaxW = 320; const camMaxH = 180; let camW = camMaxW; let camH = camW / camVideoAspect;
  if (camH > camMaxH) { camH = camMaxH; camW = camH * camVideoAspect; }
  const camX = WIDTH - camW - 10, camY = 10;
  if (lastVideoFrame) { ctx.save(); ctx.translate(camX + camW, camY); ctx.scale(-1, 1); ctx.drawImage(lastVideoFrame, 0, 0, camW, camH); ctx.restore(); }
  ctx.strokeStyle = '#0f0'; ctx.lineWidth = 2; ctx.strokeRect(camX, camY, camW, camH);
  if (lastHandLandmarks && lastHandLandmarks.length > 0) {
    ctx.fillStyle = '#0f0';
    for (const hand of lastHandLandmarks) { for (const lm of hand) { ctx.beginPath(); ctx.arc(camX + (1 - lm.x) * camW, camY + lm.y * camH, 4, 0, Math.PI * 2); ctx.fill(); } }
  }
}

// -----------------------
// 🌟 R2/R5: 高亮排行榜與自訂輸入框流程
// -----------------------
function handleGameOver(isWin) {
    console.log("🚨 觸發結算函數！"); 
    try { if (bgmPlayer && !bgmPlayer.paused) bgmPlayer.pause(); } catch (e) {}

    const finalScore = (hitCount * 100) + (houses.length * 500);
    
    setTimeout(() => {
        const message = isWin ? "🎉 恭喜過關！" : "💥 遊戲失敗！";
        const promptUI = document.getElementById('namePromptUI');
        const promptMsg = document.getElementById('promptMessage');
        const nameInput = document.getElementById('playerNameInput');
        
        promptMsg.textContent = `${message} 你的分數是 ${finalScore}`;
        promptUI.style.display = 'flex';
        
        document.getElementById('submitNameBtn').onclick = () => {
            const playerName = nameInput.value.trim() || "神秘玩家";
            promptUI.style.display = 'none';
            processAndShowLeaderboard(playerName, finalScore);
        };

        document.getElementById('cancelNameBtn').onclick = () => {
            promptUI.style.display = 'none';
            showRestartButton(); 
        };
    }, 1000); 
}

function showRestartButton() {
    if (actionBtn) {
        actionBtn.style.display = 'block';
        actionBtn.className = 'center-state';
        actionBtn.textContent = '重新開始 (選新歌)';
    }
}

function processAndShowLeaderboard(playerName, finalScore) {
    saveScoreToCloud(playerName, finalScore).then(async () => { 
        const rankQuery = query(collection(db, "leaderboard"), where("score", ">", finalScore));
        const rankSnapshot = await getCountFromServer(rankQuery);
        const currentRank = rankSnapshot.data().count + 1; 

        getTop10Scores().then(top10 => {
            const modal = document.getElementById('leaderboard-modal');
            const listContainer = document.getElementById('leaderboard-list');
            listContainer.innerHTML = ''; 
            
            let playerInserted = false;

            top10.forEach((player, index) => {
                let rank = index + 1;
                let isCurrentPlayer = (player.name === playerName && player.score === finalScore && !playerInserted);
                let medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `<span style="display:inline-block; width:25px;">${rank}.</span>`;
                
                let rowStyle = isCurrentPlayer 
                    ? `display: flex; justify-content: space-between; padding: 10px 5px; border-bottom: 1px dashed #444; font-size: 18px; background: rgba(0,255,0,0.25); font-weight: bold; color: #0f0; border-radius: 5px;` 
                    : `display: flex; justify-content: space-between; padding: 10px 5px; border-bottom: 1px dashed #444; font-size: 18px;`;

                if(isCurrentPlayer) playerInserted = true;

                listContainer.innerHTML += `
                    <li style="${rowStyle}">
                        <span>${medal} ${player.name}</span>
                        <span style="color: ${isCurrentPlayer ? '#0f0' : '#ff0'};">${player.score} 分</span>
                    </li>
                `;
            });

            if (!playerInserted) {
                let rankDisplay = currentRank <= 100 ? currentRank : `${Math.floor(currentRank / 100) * 100}+`;
                listContainer.innerHTML += `
                    <li style="display: flex; justify-content: space-between; padding: 10px 5px; margin-top: 15px; font-size: 18px; background: rgba(0,255,0,0.25); font-weight: bold; color: #0f0; border-radius: 5px; border: 1px solid #0f0;">
                        <span><span style="display:inline-block; width:45px;">${rankDisplay}.</span> ${playerName}</span>
                        <span style="color: #0f0;">${finalScore} 分</span>
                    </li>
                `;
            }

            modal.style.display = 'flex';
            showRestartButton(); 
        });
    });
}

function gameLoop() {
  if (handMissFrameCount > 0) { handMissFrameCount++; if (handMissFrameCount > HAND_PERSISTENCE_FRAMES) { lastHandLandmarks = null; } }
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  if (!gameStarted) {
    if (backgroundImg.complete && backgroundImg.naturalWidth > 0) ctx.drawImage(backgroundImg, 0, 0, WIDTH, HEIGHT); else { ctx.fillStyle = '#003366'; ctx.fillRect(0, 0, WIDTH, HEIGHT); }
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    renderCamera();
    ctx.fillStyle = '#FFF'; ctx.font = '48px Arial'; ctx.textAlign = 'center';
    if (!gesturesLoaded || !modelLoaded) { ctx.fillText('正在載入模型，請稍候...', WIDTH / 2, Math.max(HEIGHT / 2, 50)); } 
    else if (musicBeats.length === 0) { ctx.fillText('請先在左上角上傳音樂', WIDTH / 2, Math.max(HEIGHT / 2, 50)); }
    updateHud(); requestAnimationFrame(gameLoop); return;
  }

  frameCounter += 1;
  if (backgroundImg.complete && backgroundImg.naturalWidth > 0) ctx.drawImage(backgroundImg, 0, 0, WIDTH, HEIGHT); else { ctx.fillStyle = '#003366'; ctx.fillRect(0, 0, WIDTH, HEIGHT); }
  renderCamera();

  if (!gameOver && !gamePaused) {
    plane.move();
    let currentTime = bgmPlayer.currentTime + AUDIO_OFFSET; 
    const baseY = plane.y + plane.height - 30; let dropDistance = HEIGHT - Bomb.HEIGHT - baseY; 
    let travelTime = dropDistance / (Bomb.SPEED * 60); let lookAheadTime = currentTime + travelTime;
    while (currentBeatIndex < musicBeats.length && lookAheadTime >= musicBeats[currentBeatIndex].time) {
        let targetTime = musicBeats[currentBeatIndex].time; let spawnTime = targetTime - travelTime;
        let dropX = plane.x + (plane.width / 2) - (Bomb.WIDTH / 2); bombs.push(new Bomb(dropX, baseY, targetTime, spawnTime)); 
        totalBombsDropped += 1; currentBeatIndex += 1; 
    }
  }

  for (const h of houses) {
    if (houseImg.complete && houseImg.naturalWidth > 0) ctx.drawImage(houseImg, h.x, h.y, h.width, h.height); else { ctx.fillStyle = '#ffaa00'; ctx.fillRect(h.x, h.y, h.width, h.height); }
  }

  if (!gameOver) {
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i]; if (!gamePaused) b.fall(bgmPlayer.currentTime + AUDIO_OFFSET); b.render(ctx);
      const bombBottom = b.y + Bomb.HEIGHT; const hitGround = bombBottom >= HEIGHT;
      if (!b.impactResolved && !b.shrinking && !b.exploding && hitGround) {
        b.impactResolved = true; b.shouldExplode = true; b.startShrink(true);  
      }
      if (b.finished && b.shouldExplode && !b.houseDamageApplied) {
        b.houseDamageApplied = true;
        if (houses.length > 0) {
          let closestIdx = 0; let closestDist = Infinity; const bombCenterX = b.x + Bomb.WIDTH / 2; const bombCenterY = b.y + Bomb.HEIGHT / 2;
          for (let i = 0; i < houses.length; i++) {
            const h = houses[i]; const houseCenterX = h.x + h.width / 2; const houseCenterY = h.y + h.height / 2; const dist = Math.hypot(houseCenterX - bombCenterX, houseCenterY - bombCenterY);
            if (dist < closestDist) { closestDist = dist; closestIdx = i; }
          }
          houses.splice(closestIdx, 1); if (houses.length === 0) { gameOver = true; win = false; handleGameOver(false); }
        }
      }
      if (!b.shrinking && !b.exploding && (b.finished || b.shrinkTimer > Bomb.MAX_SHRINK_TIME)) bombs.splice(i, 1);
    }
    if (!gameOver && totalBombsDropped >= TARGET_BOMBS && bombs.length === 0 && houses.length > 0) { gameOver = true; win = true; handleGameOver(true); }
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = win ? '#0f0' : '#f00'; ctx.font = 'bold 56px Arial'; ctx.textAlign = 'center';
    ctx.fillText(win ? '🎉 勝利！' : '💥 失敗', WIDTH / 2, HEIGHT / 2 - 40);
  }

  if (gamePaused) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  plane.render(ctx); updateHud(); requestAnimationFrame(gameLoop);
}

let handLandmarker = null; let lastVideoTime = -1;
async function initWebcam() {
  try {
    const visionModule = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs");
    const { FilesetResolver: FR, HandLandmarker: HL } = visionModule;
    const filesetResolver = await FR.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm");
    handLandmarker = await HL.createFromOptions(filesetResolver, { baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task", delegate: "GPU" }, runningMode: "VIDEO", numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } }); video.srcObject = stream; await video.play(); lastVideoFrame = video; predictWebcam();
  } catch (error) { console.error(error); }
}

let lastPredictTime = 0; const PREDICT_FRAME_INTERVAL = 33; 
async function predictWebcam() {
  if (!handLandmarker) return;
  if (video.currentTime === lastVideoTime || performance.now() - lastPredictTime < PREDICT_FRAME_INTERVAL) { requestAnimationFrame(predictWebcam); return; }
  lastPredictTime = performance.now(); lastVideoTime = video.currentTime;
  try {
    const results = handLandmarker.detectForVideo(video, performance.now());
    let leftHandLandmarks = null; let rightHandLandmarks = null;
    if (results.landmarks && results.landmarks.length > 0 && results.handedness) {
        for (let i = 0; i < results.landmarks.length; i++) {
          const handedness = results.handedness[i][0].categoryName; 
          if (handedness === 'Left') { leftHandLandmarks = results.landmarks[i]; } else if (handedness === 'Right') { rightHandLandmarks = results.landmarks[i]; }
        }
    }
    const formattedResults = { poseLandmarks: null, faceLandmarks: null, leftHandLandmarks, rightHandLandmarks };
    const handList = []; if (leftHandLandmarks) handList.push(leftHandLandmarks); if (rightHandLandmarks) handList.push(rightHandLandmarks); lastHandLandmarks = handList.length > 0 ? handList : null;
    updateDynamicGesture(formattedResults); lastVideoFrame = video;
  } catch (e) {} requestAnimationFrame(predictWebcam);
}

// 🌟 R3: 打字機動畫邏輯
function startIntroTypewriter() {
    const text = "歡迎進入遊戲！\n\n在炸彈落地前比出上方詞語即可消滅並得 100 分；\n音樂結束時每剩一棟房子得 500 分。\n\n炸彈落地會減少房子，全失則結束。\n看看你能拿多少分！";
    const textEl = document.getElementById('typewriterText');
    const introUI = document.getElementById('introUI');
    const musicUI = document.getElementById('musicSelectionUI');
    
    let i = 0; let typingInterval;
    
    function finishIntro() {
        clearInterval(typingInterval);
        introUI.style.display = 'none';
        musicUI.style.display = 'flex'; // 秀出音樂選擇
    }
    
    document.getElementById('skipIntroBtn').addEventListener('click', finishIntro);
    
    typingInterval = setInterval(() => {
        if (i < text.length) {
            if (text.charAt(i) === '\n') { textEl.appendChild(document.createElement('br')); } 
            else { textEl.appendChild(document.createTextNode(text.charAt(i))); }
            i++;
        } else {
            clearInterval(typingInterval);
            setTimeout(finishIntro, 4000); 
        }
    }, 60); 
}

function initGame() {
  initHouses(); plane = new Plane();

  if (actionBtn) {
    actionBtn.addEventListener('click', () => {
      // 退回音樂選擇畫面
      if (gameOver) {
        gameStarted = false; gameOver = false; win = false; gamePaused = false;
        bombs = []; totalBombsDropped = 0; currentBeatIndex = 0; hitCount = 0;
        initHouses(); plane = new Plane(); resetGestureSequence();
        
        actionBtn.style.display = 'none';
        document.getElementById('musicSelectionUI').style.display = 'flex'; 
        if(parsingStatus) parsingStatus.textContent = '';
        bgmPlayer.pause(); bgmPlayer.src = ''; musicBeats = [];
        statusEl.textContent = '狀態: 準備中 (請選擇音樂)';
        if (audioUpload) audioUpload.disabled = false;
        if (defaultMusicBtn) defaultMusicBtn.disabled = false;
        updateHud(); return; 
      }
      
      if (!gameStarted) {
        if (!gesturesLoaded || !modelLoaded) return;
        gameStarted = true; gamePaused = false;
        bgmPlayer.currentTime = 0; bgmPlayer.play(); updateHud();
        actionBtn.className = 'top-left-state'; actionBtn.textContent = '暫停遊戲';
      } 
      else if (gameStarted && !gameOver && !gamePaused) {
        gamePaused = true; bgmPlayer.pause(); updateHud();
        actionBtn.className = 'center-state-instant'; actionBtn.textContent = '繼續遊戲';
      }
      else if (gameStarted && !gameOver && gamePaused) {
        gamePaused = false; bgmPlayer.play(); updateHud();
        actionBtn.className = 'top-left-state'; actionBtn.textContent = '暫停遊戲';
      }
    });
  }

  const closeBoardBtn = document.getElementById('close-leaderboard-btn');
  if (closeBoardBtn) {
      closeBoardBtn.addEventListener('click', () => {
          document.getElementById('leaderboard-modal').style.display = 'none';
      });
  }

  updateHud(); requestAnimationFrame(gameLoop);
}

// 🌟 啟動順序
initModel();
initWebcam().catch(() => { statusEl.textContent = '狀態: 無法存取攝影機（仍可遊玩）'; });
initGame();
startIntroTypewriter();
