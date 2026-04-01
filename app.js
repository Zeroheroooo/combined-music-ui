// ==========================================
// 🚀 核心演算法：Audiosurf 動態門檻節奏分析 (JS 移植版)
// ==========================================
let musicBeats = [];
let currentBeatIndex = 0;
let isAnalyzing = false;
let globalBpm = 120.0;

const bgmPlayer = document.getElementById('bgmPlayer');
const audioUpload = document.getElementById('audioUpload');

// 當玩家選擇檔案時觸發
audioUpload.addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (statusEl) statusEl.textContent = '狀態: 🎵 音樂解析中，請稍候...';
    isAnalyzing = true;

    // 1. 建立隱藏的音樂播放源
    const fileURL = URL.createObjectURL(file);
    bgmPlayer.src = fileURL;

    // 2. 讀取檔案二進位資料給 Web Audio API 解析
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // 3. 執行你自創的「智慧分析演算法」
    musicBeats = await analyzeBeatsSmartJS(audioBuffer);
    
    isAnalyzing = false;
    if (statusEl) statusEl.textContent = '狀態: ✅ 解析完成！按 Enter 開始遊戲';
});

// 你 Python 裡的 analyze_beats_smart 完整 JS 翻譯版
async function analyzeBeatsSmartJS(audioBuffer) {
    const duration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;
    
    // 使用離線運算，瞬間將音樂拆成 低、中、高 三個頻段 (模擬 librosa melspectrogram)
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
    const renderedBuffer = await offlineCtx.startRendering(); // C++ 引擎飆速運算

    // 取得能量包絡 (Onset Strength)
    function getOnsetEvents(channelData, lane, targetMin, targetMax) {
        const windowSize = Math.floor(sampleRate * 0.05); // 50ms
        const stepSize = Math.floor(sampleRate * 0.01);   // 10ms
        let energy = [];
        
        for (let i = 0; i < channelData.length - windowSize; i += stepSize) {
            let sum = 0;
            for (let j = 0; j < windowSize; j++) sum += channelData[i+j] * channelData[i+j];
            energy.push(Math.sqrt(sum / windowSize));
        }
        
        const maxE = Math.max(...energy);
        const minE = Math.min(...energy);
        const normEnergy = energy.map(e => (e - minE) / (maxE - minE + 1e-6));

        // 動態尋找最佳門檻 (跟你的 Python 一模一樣的迴圈)
        let threshold = 0.35;
        let events = [];
        for (let attempt = 0; attempt < 6; attempt++) {
            events = [];
            // 抓出波峰 (Peaks)
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

    // --- 絕對強制冷卻系統 ---
    let filteredEvents = [];
    let lastBombTime = -999.0;
    for (let ev of allEvents) {
        if (ev.time - lastBombTime >= 3.0) {
            filteredEvents.push(ev);
            lastBombTime = ev.time;
        }
    }

    // --- 保底補償機制 ---
    let finalEvents = [];
    const fillInterval = 3.0; // 預設 1 秒補一顆 (JS 算 BPM 較耗時，直接用通用節拍)
    const MAX_EMPTY_GAP = 5.0;

    if (filteredEvents.length > 0) {
        finalEvents.push(filteredEvents[0]);
        for (let i = 1; i < filteredEvents.length; i++) {
            let prevTime = finalEvents[finalEvents.length - 1].time;
            let curr = filteredEvents[i];
            
            while (curr.time - prevTime > MAX_EMPTY_GAP) {
                let fillerTime = prevTime + fillInterval;
                if (curr.time - fillerTime < 1.0) break;
                finalEvents.push({ time: fillerTime, lane: Math.floor(Math.random() * 3) });
                prevTime = fillerTime;
            }
            finalEvents.push(curr);
        }
    }
    
    console.log(`🎵 音樂分析完成！共產生 ${finalEvents.length} 顆炸彈。`);
    // 預先計算總目標數給 UI
    TARGET_BOMBS = finalEvents.length; 
    return finalEvents;
}
// ==========================================
// app.js: 台灣手語學習遊戲 Web 版
// 1) Canvas 遊戲、2) MediaPipe Hands (執行手勢偵測雛形)

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const scoreEl = document.getElementById('score');
const lifeEl = document.getElementById('life');
const video = document.getElementById('video');
const gestureEl = document.getElementById('gesture');
const progressEl = document.getElementById('progress');

// 畫布尺寸與遊戲範圍自動適應視窗（行為參數仍比照 Python 版）
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

// -----------------------
// 遊戲狀態對應 Python 版
// -----------------------
let score = 0;
let bombs = [];
let frameCounter = 0;

// 房子相關（等同於 house_health）
const HOUSE_COUNT = 10;
const HOUSE_WIDTH = 120;
const HOUSE_HEIGHT = 80;
const HOUSE_MARGIN_BOTTOM = 20;
let houses = [];

// 飛機與炸彈統計
let plane = null;
let totalBombsDropped = 0;
// 再降低場上同時炸彈數量，讓畫面更乾淨
const MIN_ACTIVE_BOMBS = 2;
let TARGET_BOMBS = 15;
// 放慢補充炸彈的速度
let minBombReplenishDelay = 150;
let minBombReplenishCounter = 100;

let gameOver = false;
let win = false;
let gameStarted = false;

// -----------------------
// 載入圖片資源（背景／房子／飛機／炸彈／爆炸）
// -----------------------

let isProcessingFrame = false; // 防止送太多幀把主執行緒塞爆

// ----- Web Worker for DTW (keeps main thread / canvas silky smooth) -----
const dtwWorker = new Worker('dtw_worker.js');
let workerBusy = false;

dtwWorker.onmessage = function (e) {
  const { type, words, match, score } = e.data;

  if (type === 'GESTURES_LOADED') {
    console.log('DTW Worker ready. Loaded words.');
    fullVocabulary = e.data.vocab || [];
    gesturesLoaded = true;
    updateDifficultySelection();
    return;
  }

  // Worker finished a MATCH request
  workerBusy = false;

  // 無論有沒有配對，先更新得分顯示幫助調 debug 門檻
  if (gestureEl) {
    if (match) {
      gestureEl.textContent = `偵測: ${match} (得分: ${score.toFixed(1)})`;
    } else {
      gestureEl.textContent = `偵測: 最佳分數 ${score === Infinity ? '--' : score.toFixed(1)}`;
    }
  }

  if (type === 'RESULT' && match && gameStarted && !gameOver) {
    for (let b of bombs) {
      if (b.word === match && !b.shrinking && !b.exploding) {
        b.startShrink(false);
        dtwCooldown = 25;
        liveBuffer = [];
        if (progressEl) progressEl.textContent = `進度: ✓ 辨識成功 (${match})`;
        break;
      }
    }
  }
};

let fullVocabulary = [];
let currentVocabulary = [{ text: '載入中...', difficulty: 1 }]; // fallback
let gesturesLoaded = false;

function updateDifficultySelection() {
  const diffSelect = document.getElementById('difficulty-select');
  const selectedDifficulty = diffSelect ? diffSelect.value : 'all';
  
  if (selectedDifficulty === 'all') {
    currentVocabulary = fullVocabulary.length > 0 ? [...fullVocabulary] : [{text: '無資料', difficulty: 1}];
  } else {
    const diffInt = parseInt(selectedDifficulty, 10);
    const filtered = fullVocabulary.filter(v => v.difficulty === diffInt);
    currentVocabulary = filtered.length > 0 ? filtered : (fullVocabulary.length > 0 ? [...fullVocabulary] : [{text: '無資料', difficulty: 1}]);
  }
}

// 監聽難度下拉選單變更
const difficultySelect = document.getElementById('difficulty-select');
if (difficultySelect) {
  difficultySelect.addEventListener('change', updateDifficultySelection);
}

// Start the worker's internal initialization
dtwWorker.postMessage({ type: 'LOAD_GESTURES' });

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
// 房子與飛機類別（對應 Python）
// -----------------------

class Plane {
  constructor() {
    this.width = 120;
    this.height = 50;
    this.x = 0;
    // 調高飛機高度，避免壓到房子與玩家畫面
    this.y = 50;
    this.speed = 3;
    this.direction = 1; // 1=右, -1=左
    this.dropCooldown = 150;
  }

  move() {
    this.x += this.speed * this.direction;

    // 碰到右邊界或玩家畫面區域就回頭
    const videoAreaLeft = WIDTH - 260; // 與 index.html 右上攝影機框線對齊
    if (this.x + this.width >= videoAreaLeft) {
      this.x = videoAreaLeft - this.width;
      this.direction = -1;
    } else if (this.x <= 0) {
      this.x = 0;
      this.direction = 1;
    }

    if (this.dropCooldown > 0) {
      this.dropCooldown -= 1;
    }
  }

  maybeDropBomb() {
    if (this.dropCooldown <= 0) {
      // 再延長冷卻時間，讓隨機掉落更不頻繁
      this.dropCooldown = Math.floor(180 + Math.random() * 120); // 180–300 幀
      const baseX = this.x + this.width / 2 - Bomb.WIDTH / 2;
      const offset = (Math.random() * 60) - 30;
      const x = Math.max(0, Math.min(WIDTH - Bomb.WIDTH, baseX + offset));
      return new Bomb(x, this.y + this.height - 30);
    }
    return null;
  }

  render(ctx) {
    if (planeImg.complete && planeImg.naturalWidth > 0) {
      const imgH = this.height;
      const imgW = (planeImg.naturalWidth / planeImg.naturalHeight) * imgH;
      const drawX = this.x + (this.width - imgW) / 2;
      const drawY = this.y;
      // 水平翻轉與否依 direction 決定
      ctx.save();
      if (this.direction === -1) {
        ctx.translate(drawX + imgW / 2, 0);
        ctx.scale(-1, 1);
        ctx.translate(-(drawX + imgW / 2), 0);
      }
      ctx.drawImage(planeImg, drawX, drawY, imgW, imgH);
      ctx.restore();
    } else {
      ctx.fillStyle = '#999';
      ctx.fillRect(this.x, this.y, this.width, this.height);
    }
  }
}

class Bomb {
  static WIDTH = 100;
  static HEIGHT = 100;
  // 大幅降低炸彈下降速度
  static SPEED = 1.2;
  static MAX_SHRINK_TIME = 15;

  constructor(x, y) {
    this.x = x ?? Math.random() * (WIDTH - Bomb.WIDTH);
    this.y = y ?? -Bomb.HEIGHT;
    this.word = randomVocab().text;
    this.shrinking = false;
    this.shrinkTimer = 0;
    this.exploding = false;
    this.explosionTimer = 0;
    this.shouldExplode = false; // 只在炸到房子或地面時爆炸
    this.finished = false;      // 縮小結束且不需要爆炸時使用
    this.impactResolved = false; // 確保只觸發一次（避免落地後每幀連續扣房子）
  }

  fall() {
    if (!this.shrinking && !this.exploding) {
      this.y += Bomb.SPEED;
    }
  }

  // shouldExplode = true 代表這顆炸彈之後要播放爆炸動畫（例如炸到房子/地面）
  startShrink(shouldExplode = false) {
    if (this.exploding) return;
    this.shrinking = true;
    this.shrinkTimer = 0;
    this.shouldExplode = shouldExplode;
    this.impactResolved = true;
  }

  render(ctx) {
    if (this.finished) return;

    let drawX = this.x;
    let drawY = this.y;
    let drawW = Bomb.WIDTH;
    let drawH = Bomb.HEIGHT;

    if (this.shrinking) {
      this.shrinkTimer += 1;
      const ratio = 1 - this.shrinkTimer / Bomb.MAX_SHRINK_TIME;
      if (ratio > 0) {
        drawW = Bomb.WIDTH * ratio;
        drawH = Bomb.HEIGHT * ratio;
        const offsetX = (Bomb.WIDTH - drawW) / 2;
        const offsetY = (Bomb.HEIGHT - drawH) / 2;
        drawX = this.x + offsetX;
        drawY = this.y + offsetY;
      } else {
        // 縮小結束：依照 shouldExplode 決定是否進入爆炸動畫
        this.shrinking = false;
        if (this.shouldExplode) {
          this.exploding = true;
          this.explosionTimer = 0;
        } else {
          // 手勢/空白鍵消除：不需要爆炸，標記為完成，等主迴圈移除
          this.finished = true;
        }
      }
    }

    // 爆炸效果（以 explosion.png 為中心顯示）
    if (this.exploding) {
      this.explosionTimer += 1;
      const maxExplosionFrames = 10; // 爆炸維持幾幀
      const size = Bomb.WIDTH * 1.3;
      const ex = this.x + (Bomb.WIDTH - size) / 2;
      const ey = this.y + (Bomb.HEIGHT - size) / 2;

      if (explosionImg.complete && explosionImg.naturalWidth > 0) {
        ctx.drawImage(explosionImg, ex, ey, size, size);
      } else {
        ctx.fillStyle = 'orange';
        ctx.beginPath();
        ctx.arc(this.x + Bomb.WIDTH / 2, this.y + Bomb.HEIGHT / 2, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 爆炸時不再畫炸彈本體與文字
      if (this.explosionTimer >= maxExplosionFrames) {
        this.exploding = false;
        this.finished = true;
      }
      return;
    }

    if (bombImg.complete && bombImg.naturalWidth > 0) {
      ctx.drawImage(bombImg, drawX, drawY, drawW, drawH);
    } else {
      ctx.fillStyle = '#CC0000';
      ctx.fillRect(drawX, drawY, drawW, drawH);
    }

    ctx.fillStyle = '#FFF';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    // 在這裡調整文字在炸彈上的位置（偏移量）
    const textOffsetX = 0;   // 正數往右、負數往左
    const textOffsetY = 10;  // 正數往下、負數往上
    ctx.fillText(
      this.word,
      this.x + Bomb.WIDTH / 2 + textOffsetX,
      this.y + Bomb.HEIGHT / 2 + textOffsetY
    );
  }
}

// -----------------------
// 動態手勢偵測（變成包裝 Worker 消息的线上處理）
// -----------------------

let lastHandLandmarks = null;
let lastVideoFrame = null;

const LIVE_BUFFER_MAX = 45;
// 至少要蒐集這麼多幀才觸發比對
const LIVE_BUFFER_REQUIRED = 20;
let liveBuffer = [];
let dtwCooldown = 0;
let handWasPresent = false;  // 追蹤手是否剛離開畫面

function resetGestureSequence() {
  liveBuffer = [];
  dtwCooldown = 0;
  workerBusy = false;
  handWasPresent = false;
  if (progressEl) progressEl.textContent = '進度: 等待手勢...';
}

function getRawHandsFlat(results) {
  let left_hand = null;
  let right_hand = null;

  if (results.multiHandLandmarks && results.multiHandedness) {
    for (let i = 0; i < results.multiHandedness.length; i++) {
      const label = results.multiHandedness[i].label;
      if (label === 'Left') left_hand = results.multiHandLandmarks[i];
      if (label === 'Right') right_hand = results.multiHandLandmarks[i];
    }
  }

  const numPoints = 42; // Actually 21 points per hand, each is (x,y) raw
  const flat = new Float32Array(84); // 21 * 2 * 2
  let idx = 0;

  function addHand(hand) {
    if (!hand) {
      for (let i = 0; i < 21; i++) { flat[idx++] = 0; flat[idx++] = 0; }
      return;
    }
    for (const p of hand) {
      flat[idx++] = p.x;
      flat[idx++] = p.y;
    }
  }
  
  addHand(left_hand);
  addHand(right_hand);
  return flat;
}

function updateDynamicGesture(results) {
  if (dtwCooldown > 0) dtwCooldown--;

  const hasHand = results && results.multiHandLandmarks && results.multiHandLandmarks.length > 0;

  if (!hasHand) {
    if (handWasPresent && liveBuffer.length >= LIVE_BUFFER_REQUIRED && !workerBusy && dtwCooldown <= 0 && bombs.length > 0) {
      const activeWords = Array.from(new Set(bombs.map(b => b.word)));
      const liveFrames = liveBuffer.length;
      const numPoints = 42;
      const liveFlat = new Float32Array(liveFrames * numPoints * 2);
      for (let f = 0; f < liveFrames; f++) {
        liveFlat.set(liveBuffer[f], f * numPoints * 2);
      }
      workerBusy = true;
      dtwWorker.postMessage(
        { type: 'MATCH', data: { liveFlat, liveFrames, numPoints, activeWords, threshold: 40.0 } },
        [liveFlat.buffer]
      );
    }
    handWasPresent = false;
    liveBuffer = []; // 手離開後清空，下次需從頭弁
    if (progressEl && dtwCooldown <= 0) progressEl.textContent = '進度: 等待手勢...';
    return;
  }

  handWasPresent = true;
  
  const frame = getRawHandsFlat(results);
  liveBuffer.push(frame);
  if (liveBuffer.length > LIVE_BUFFER_MAX) liveBuffer.shift();

  if (progressEl) {
    progressEl.textContent = `進度: 錄製動作 (${liveBuffer.length}/${LIVE_BUFFER_MAX})`;
  }
}

function initHouses() {
  houses = [];

  // 盡量隨機分散在底部，避免完全重疊（簡化版）
  const attemptsLimit = 5000;
  let attempts = 0;
  while (houses.length < HOUSE_COUNT && attempts < attemptsLimit) {
    const x = Math.random() * (WIDTH - HOUSE_WIDTH);
    const y = HEIGHT - HOUSE_HEIGHT - HOUSE_MARGIN_BOTTOM;
    const rect = { x, y, width: HOUSE_WIDTH, height: HOUSE_HEIGHT };

    let overlapSameSpot = false;
    for (const h of houses) {
      const samePos = Math.abs(h.x - rect.x) < 1 && Math.abs(h.y - rect.y) < 1;
      if (samePos) {
        overlapSameSpot = true;
        break;
      }
    }
    if (!overlapSameSpot) {
      houses.push(rect);
    }
    attempts += 1;
  }

  while (houses.length < HOUSE_COUNT) {
    const x = 50 + houses.length * (HOUSE_WIDTH + 10);
    const y = HEIGHT - HOUSE_HEIGHT - HOUSE_MARGIN_BOTTOM;
    houses.push({ x, y, width: HOUSE_WIDTH, height: HOUSE_HEIGHT });
  }
}

function updateHud() {
  scoreEl.textContent = `房子數: ${houses.length}`;
  lifeEl.textContent = `已掉落炸彈: ${totalBombsDropped}/${TARGET_BOMBS}`;

  // 🌟 新增：讓狀態列優先顯示「音樂解析」的進度
  if (isAnalyzing) {
    statusEl.textContent = '狀態: 🎵 音樂解析中，請稍候...';
  } else if (!gameStarted) {
    // 判斷是否已經有炸彈劇本了
    if (musicBeats.length > 0) {
      statusEl.textContent = `狀態: ✅ 載入 ${TARGET_BOMBS} 顆炸彈 (按 Enter 開始)`;
    } else {
      statusEl.textContent = '狀態: 準備中 (請先在左上角上傳音樂)';
    }
  } else if (!gameOver) {
    statusEl.textContent = '狀態: 遊玩中';
  } else if (win) {
    statusEl.textContent = '狀態: 勝利！';
  } else {
    statusEl.textContent = '狀態: 失敗';
  }
}

// -----------------------
// 主迴圈（對應 Python while True）
// -----------------------

function gameLoop() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  if (!gameStarted) {
    if (backgroundImg.complete && backgroundImg.naturalWidth > 0) {
      ctx.drawImage(backgroundImg, 0, 0, WIDTH, HEIGHT);
    } else {
      ctx.fillStyle = '#003366';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#FFF';
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    if (!gesturesLoaded) {
      ctx.fillText('正在載入詞彙，請稍候...', WIDTH / 2, Math.max(HEIGHT / 2, 50));
    } else {
      ctx.fillText('按 Enter 鍵開始遊戲', WIDTH / 2, Math.max(HEIGHT / 2, 50));
    }

    // 即使沒開始，也要更新上方的狀態，且因為有攝像頭所以最好繼續 requestAnimationFrame
    updateHud();
    requestAnimationFrame(gameLoop);
    return;
  }

  frameCounter += 1;

  // 背景（使用背景圖，若未載入則用純色）
  if (backgroundImg.complete && backgroundImg.naturalWidth > 0) {
    ctx.drawImage(backgroundImg, 0, 0, WIDTH, HEIGHT);
  } else {
    ctx.fillStyle = '#003366';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // 右上角攝影機畫面（鏡像）與節點：都畫在 canvas 上
  const camX = WIDTH - 260;
  const camY = 10;
  const camW = 240;
  const camH = 180;

  if (lastVideoFrame) {
    // 先畫鏡像的攝影機畫面
    ctx.save();
    ctx.translate(camX + camW, camY);
    ctx.scale(-1, 1);
    ctx.drawImage(lastVideoFrame, 0, 0, camW, camH);
    ctx.restore();
  }

  ctx.strokeStyle = '#0f0';
  ctx.lineWidth = 2;
  ctx.strokeRect(camX, camY, camW, camH);

  // 再畫手部節點，座標也要鏡像（x -> 1 - x）
  if (lastHandLandmarks && lastHandLandmarks.length > 0) {
    ctx.fillStyle = '#0f0';
    for (const hand of lastHandLandmarks) {
      for (const lm of hand) {
        const xNorm = 1 - lm.x; // 水平鏡像
        const x = camX + xNorm * camW;
        const y = camY + lm.y * camH;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  if (!gameOver) {
    // 飛機依然要在天上巡邏移動
    plane.move();

    // ✅ 刪除了舊的隨機與保底機制
    // ✅ 新增：精準音樂對拍空投系統
    if (gameStarted) {
      let currentTime = bgmPlayer.currentTime; 
      
      // 🌟 1. 精算掉落時間 (物理學公式：時間 = 距離 / 速度)
      // 掉落距離大概是：總高度(800) - 房子高度(80) - 上方預留空間(約150) = 570 像素
      let dropDistance = HEIGHT - HOUSE_HEIGHT - 150; 
      
      // 算出炸彈飛完這段距離需要幾秒 (乘以 60 是因為每秒大約 60 幀)
      let travelTime = dropDistance / (Bomb.SPEED * 60); 

      // 🌟 2. 啟動「未來視」：讓程式去看 (現在時間 + 飛行時間) 的劇本
      let lookAheadTime = currentTime + travelTime;

      // 🌟 3. 用「未來的時間」來觸發投彈
      while (currentBeatIndex < musicBeats.length && lookAheadTime >= musicBeats[currentBeatIndex].time) {
        
        let targetLane = musicBeats[currentBeatIndex].lane;
        let usableWidth = WIDTH - 260; 
        let laneX = (usableWidth / 3) * targetLane + (usableWidth / 6) - (Bomb.WIDTH / 2);

        plane.x = laneX; 
        
        // 1. 計算這顆炸彈原本「應該被丟出來的時間」
        let targetTime = musicBeats[currentBeatIndex].time;
        let spawnTime = targetTime - travelTime;

        // 2. 計算它「遲到」了幾秒 (通常只有遊戲剛開始前幾秒的炸彈會遲到)
        let timeOverdue = currentTime - spawnTime;

        // 3. 根據遲到的時間，把它往下推！(遲到幾秒 * 每秒掉落的像素)
        // 使用 Math.max 確保只有正數才會往下推
        let offsetY = Math.max(0, timeOverdue * (Bomb.SPEED * 60));
        
        // 4. 加上補償距離，把它生在正確的半空中
        const dropY = plane.y + plane.height - 30 + offsetY;
        bombs.push(new Bomb(laneX, dropY));
        
        totalBombsDropped += 1;
        currentBeatIndex += 1; 
      }
    }
  }

  // 畫房子
  ctx.fillStyle = '#ffaa00';
  for (const h of houses) {
    if (houseImg.complete && houseImg.naturalWidth > 0) {
      ctx.drawImage(houseImg, h.x, h.y, h.width, h.height);
    } else {
      ctx.fillRect(h.x, h.y, h.width, h.height);
    }
  }

  // 更新炸彈
  if (!gameOver) {
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i];
      b.fall();
      b.render(ctx);

      // 到地面或碰到房子就縮小並爆炸，隨機消除一棟房子
      const bombBottom = b.y + Bomb.HEIGHT;
      let hitAnyHouse = false;

      for (let hi = 0; hi < houses.length; hi++) {
        const h = houses[hi];
        const collideX = b.x < h.x + h.width && b.x + Bomb.WIDTH > h.x;
        const collideY = b.y < h.y + h.height && bombBottom > h.y;
        if (collideX && collideY) {
          hitAnyHouse = true;
          break;
        }
      }

      if (!b.impactResolved && !b.shrinking && !b.exploding && (hitAnyHouse || bombBottom >= HEIGHT)) {
        // 無論是炸到房子或地面：縮小後要爆炸，並隨機消除一棟房子
        b.startShrink(true);
        if (houses.length > 0) {
          const idx = Math.floor(Math.random() * houses.length);
          houses.splice(idx, 1);
          if (houses.length === 0) {
            gameOver = true;
            win = false;
          }
        }
      }

      // 手勢/空白鍵消除：縮小動畫結束（finished=true）後直接移除
      // 或是縮小 + 爆炸動畫都結束後才真正移除炸彈
      if (!b.shrinking && !b.exploding && (b.finished || b.shrinkTimer > Bomb.MAX_SHRINK_TIME)) {
        bombs.splice(i, 1);
      }
    }

    // 勝利條件：炸彈丟完且場上沒有炸彈、還有房子
    if (!gameOver && totalBombsDropped >= TARGET_BOMBS && bombs.length === 0 && houses.length > 0) {
      gameOver = true;
      win = true;
    }
  } else {
    // 遊戲結束畫面
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = win ? '#00ff00' : '#ff0000';
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(win ? '勝利！' : '失敗', WIDTH / 2, HEIGHT / 2 - 20);
    ctx.fillStyle = '#FFF';
    ctx.font = '32px Arial';
    ctx.fillText('按 Enter 鍵重新開始', WIDTH / 2, HEIGHT / 2 + 40);
  }

  // 畫飛機
  plane.render(ctx);

  updateHud();

  requestAnimationFrame(gameLoop);
}

// -----------------------------------
// MediaPipe Hands 啟用（主執行緒優化版）
// -----------------------------------

async function initWebcam() {
  if (!window.Hands || !window.Camera) {
    statusEl.textContent = '狀態: 無法載入 MediaPipe Hands（仍可遊玩）';
    return;
  }

  statusEl.textContent = '狀態: 正在載入 AI 引擎...';

  const hands = new window.Hands({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  hands.onResults((results) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      lastHandLandmarks = results.multiHandLandmarks; // 儲存所有偵測到的手，用來繪製雙手

      // 不管有沒有遊戲結束都偵測並更新緩衝
      if (gameStarted && !gameOver) {
        updateDynamicGesture(results);
      }

    } else {
      lastHandLandmarks = null;
      if (gameStarted && !gameOver) {
        updateDynamicGesture(null);
      }
    }

    if (results.image) {
      lastVideoFrame = results.image;
    }

    // 辨識完成，允許處理下一幀
    isProcessingFrame = false;
  });

  const camera = new window.Camera(video, {
    onFrame: async () => {
      // 若上一幀還沒處理完，直接拋棄這一幀 (Drop frame)，保證遊戲畫面順暢
      if (isProcessingFrame) return;

      isProcessingFrame = true;
      try {
        await hands.send({ image: video });
      } catch (err) {
        console.error("Hands process error:", err);
        isProcessingFrame = false;
      }
    },
    width: 640,
    height: 480,
  });

  await camera.start();
  statusEl.textContent = '狀態: 已連線攝像頭（可進行手勢偵測）';
}

// -----------------------
// 初始化與輸入（暫用鍵盤模擬手勢）
// -----------------------

function initGame() {
  initHouses();
  plane = new Plane();

  // 新增 Enter 鍵控制遊戲開始與重新開始，保留 Space 鍵為手勢模擬
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
      e.preventDefault();

      // 🌟 新增 1：防呆機制！如果玩家沒上傳音樂就按 Enter，要擋住他
      if (musicBeats.length === 0 || isAnalyzing) {
        alert("請先上傳音樂並等待解析完成喔！");
        return; 
      }

      if (!gameStarted) {
        if (!gesturesLoaded) return; // 詞彙還沒載入，不允許開始
        gameStarted = true;
        
        // 🌟 新增 2：第一次開始遊戲，把音樂催落去！
        bgmPlayer.play(); 

      } else if (gameOver) {
        // 重新開始
        gameStarted = true;
        gameOver = false;
        win = false;
        bombs = [];
        totalBombsDropped = 0;
        initHouses();
        plane = new Plane();
        resetGestureSequence();

        // 🌟 新增 3：死掉重新開始時，節拍索引歸零、音樂拉回最開頭並播放
        currentBeatIndex = 0;
        bgmPlayer.currentTime = 0;
        bgmPlayer.play();
      }
    }

    if (e.code === 'Space' && !gameOver && gameStarted) {
      if (bombs.length > 0) {
        // 空白鍵消除：只縮小，不爆炸
        bombs[0].startShrink(false);
      }
    }
  });

  updateHud();
  requestAnimationFrame(gameLoop);
}

initWebcam().catch(() => {
  statusEl.textContent = '狀態: 無法存取攝影機（仍可遊玩）';
});
initGame();
