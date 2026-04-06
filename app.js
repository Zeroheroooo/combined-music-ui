const AUDIO_OFFSET = 0.08;
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

    // 🛑 防線一：限制檔案大小 (15 MB)，防止記憶體撐爆
    const maxSize = 15 * 1024 * 1024; 
    if (file.size > maxSize) {
        alert("這首歌太長或檔案太大囉！請上傳 15MB 以下的音樂檔。");
        e.target.value = ''; // 清空上傳欄位
        return; 
    }

    // 🛑 防線二：開始解析時，鎖死上傳按鈕，防止玩家狂點上傳產生多重宇宙
    audioUpload.disabled = true;

    if (statusEl) statusEl.textContent = '狀態: 🎵 音樂解析中，請稍候...';
    isAnalyzing = true;

    try {
        // 1. 建立隱藏的音樂播放源
        const fileURL = URL.createObjectURL(file);
        bgmPlayer.src = fileURL;

        // 2. 讀取檔案二進位資料給 Web Audio API 解析
        const arrayBuffer = await file.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        // 3. 執行你自創的「智慧分析演算法」
        musicBeats = await analyzeBeatsSmartJS(audioBuffer);
        
        if (statusEl) statusEl.textContent = '狀態: ✅ 解析完成！按 Enter 開始遊戲';
    } catch (error) {
        // 🛑 捕捉音樂解析失敗的極端狀況
        console.error("音樂解析失敗:", error);
        alert("這首音樂無法解析，請換一首歌試試看！");
        if (statusEl) statusEl.textContent = '狀態: 準備中 (請重新上傳)';
    } finally {
        isAnalyzing = false;
        // 🛑 防線二：解析完成或失敗後，解鎖上傳按鈕
        audioUpload.disabled = false;
    }
});

// 你 Python 裡的 analyze_beats_smart 完整 JS 翻譯版
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
        
        const maxE = Math.max(...energy);
        const minE = Math.min(...energy);
        const normEnergy = energy.map(e => (e - minE) / (maxE - minE + 1e-6));

        let threshold = 0.35;
        let events = [];
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

    let filteredEvents = [];
    let lastBombTime = -999.0;
    for (let ev of allEvents) {
        if (ev.time - lastBombTime >= 3.0) {
            filteredEvents.push(ev);
            lastBombTime = ev.time;
        }
    }

    let finalEvents = [];
    const fillInterval = 3.0; 
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
    TARGET_BOMBS = finalEvents.length; 
    return finalEvents;
}

// ==========================================
// app.js: 台灣手語學習遊戲 Web 版
// ==========================================

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const scoreEl = document.getElementById('score');
const lifeEl = document.getElementById('life');
const video = document.getElementById('video');
const gestureEl = document.getElementById('gesture');
const progressEl = document.getElementById('progress');

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
let TARGET_BOMBS = 15;

let gameOver = false;
let win = false;
let gameStarted = false;

let isProcessingFrame = false; 

// 🛑 防線四：Web Worker 超時機制封裝
let dtwWorker;
let workerBusy = false;
let dtwTimeout = null;

function initWorker() {
  dtwWorker = new Worker('dtw_worker.js');
  
  dtwWorker.onmessage = function (e) {
    // 🛑 收到 Worker 訊息，安全拆除超時炸彈！
    clearTimeout(dtwTimeout);

    const { type, words, match, score } = e.data;

    if (type === 'GESTURES_LOADED') {
      console.log('DTW Worker ready. Loaded words.');
      fullVocabulary = e.data.vocab || [];
      gesturesLoaded = true;
      updateDifficultySelection();
      return;
    }

    workerBusy = false;

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
  
  dtwWorker.postMessage({ type: 'LOAD_GESTURES' });
}

// 初始化啟動 Worker
initWorker();

let fullVocabulary = [];
let currentVocabulary = [{ text: '載入中...', difficulty: 1 }]; 
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

const difficultySelect = document.getElementById('difficulty-select');
if (difficultySelect) {
  difficultySelect.addEventListener('change', updateDifficultySelection);
}

const backgroundImg = new Image(); backgroundImg.src = 'background.png';
const houseImg = new Image(); houseImg.src = 'house.png';
const planeImg = new Image(); planeImg.src = 'plane.png';
const bombImg = new Image(); bombImg.src = 'bomb.png';
const explosionImg = new Image(); explosionImg.src = 'explosion.png';

function randomVocab() {
  return currentVocabulary[Math.floor(Math.random() * currentVocabulary.length)];
}

class Plane {
  constructor() {
    this.width = 120;
    this.height = 50;
    this.x = 0;
    this.y = 50;
    this.speed = 3;
    this.direction = 1; 
    this.dropCooldown = 150;
  }

  move() {
    this.x += this.speed * this.direction;
    const videoAreaLeft = WIDTH - 260; 
    if (this.x + this.width >= videoAreaLeft) {
      this.x = videoAreaLeft - this.width;
      this.direction = -1;
    } else if (this.x <= 0) {
      this.x = 0;
      this.direction = 1;
    }
    if (this.dropCooldown > 0) this.dropCooldown -= 1;
  }

  render(ctx) {
    if (planeImg.complete && planeImg.naturalWidth > 0) {
      const imgH = this.height;
      const imgW = (planeImg.naturalWidth / planeImg.naturalHeight) * imgH;
      const drawX = this.x + (this.width - imgW) / 2;
      const drawY = this.y;
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
  static SPEED = 1.2;
  static MAX_SHRINK_TIME = 15;

  constructor(x, y, targetTime) {
    this.x = x ?? Math.random() * (WIDTH - Bomb.WIDTH);
    this.y = y ?? -Bomb.HEIGHT;
    this.targetTime = targetTime;
    this.word = randomVocab().text;
    this.shrinking = false;
    this.shrinkTimer = 0;
    this.exploding = false;
    this.explosionTimer = 0;
    this.shouldExplode = false; 
    this.finished = false;      
    this.impactResolved = false; 
  }

  fall() {
    if (!this.shrinking && !this.exploding) {
      this.y += Bomb.SPEED;
    }
  }

  startShrink(shouldExplode = false) {
    if (this.exploding) return;
    this.shrinking = true;
    this.shrinkTimer = 0;
    this.shouldExplode = shouldExplode;
    this.impactResolved = true;
  }

  render(ctx) {
    if (this.finished) return;

    let drawX = this.x; let drawY = this.y;
    let drawW = Bomb.WIDTH; let drawH = Bomb.HEIGHT;

    if (this.shrinking) {
      this.shrinkTimer += 1;
      const ratio = 1 - this.shrinkTimer / Bomb.MAX_SHRINK_TIME;
      if (ratio > 0) {
        drawW = Bomb.WIDTH * ratio; drawH = Bomb.HEIGHT * ratio;
        const offsetX = (Bomb.WIDTH - drawW) / 2;
        const offsetY = (Bomb.HEIGHT - drawH) / 2;
        drawX = this.x + offsetX; drawY = this.y + offsetY;
      } else {
        this.shrinking = false;
        if (this.shouldExplode) {
          this.exploding = true;
          this.explosionTimer = 0;
        } else {
          this.finished = true;
        }
      }
    }

    if (this.exploding) {
      this.explosionTimer += 1;
      const maxExplosionFrames = 10; 
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
    const textOffsetX = 0;   
    const textOffsetY = 10;  
    ctx.fillText(this.word, this.x + Bomb.WIDTH / 2 + textOffsetX, this.y + Bomb.HEIGHT / 2 + textOffsetY);
  }
}

let lastHandLandmarks = null;
let lastVideoFrame = null;
const LIVE_BUFFER_MAX = 45;
const LIVE_BUFFER_REQUIRED = 20;
let liveBuffer = [];
let dtwCooldown = 0;
let handWasPresent = false;  

function resetGestureSequence() {
  liveBuffer = [];
  dtwCooldown = 0;
  workerBusy = false;
  handWasPresent = false;
  if (progressEl) progressEl.textContent = '進度: 等待手勢...';
}

function getRawHandsFlat(results) {
  let left_hand = null; let right_hand = null;
  if (results.multiHandLandmarks && results.multiHandedness) {
    for (let i = 0; i < results.multiHandedness.length; i++) {
      const label = results.multiHandedness[i].label;
      if (label === 'Left') left_hand = results.multiHandLandmarks[i];
      if (label === 'Right') right_hand = results.multiHandLandmarks[i];
    }
  }

  const numPoints = 42; 
  const flat = new Float32Array(84); 
  let idx = 0;

  function addHand(hand) {
    if (!hand) {
      for (let i = 0; i < 21; i++) { flat[idx++] = 0; flat[idx++] = 0; }
      return;
    }
    for (const p of hand) {
      flat[idx++] = p.x; flat[idx++] = p.y;
    }
  }
  
  addHand(left_hand); addHand(right_hand);
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
      
      // 🛑 防線四：送出運算前，啟動 3 秒超時自毀裝置
      clearTimeout(dtwTimeout);
      dtwTimeout = setTimeout(() => {
          console.warn("🛑 防呆：AI 運算超時！強制重置 Worker...");
          dtwWorker.terminate(); // 殺掉卡死的舊員工
          initWorker();          // 重新聘請新員工
          workerBusy = false;
          dtwCooldown = 0;
          alert("手勢運算太複雜卡住了，已為您自動重新啟動 AI 引擎！");
      }, 3000);

      dtwWorker.postMessage(
        { type: 'MATCH', data: { liveFlat, liveFrames, numPoints, activeWords, threshold: 40.0 } },
        [liveFlat.buffer]
      );
    }
    handWasPresent = false;
    liveBuffer = []; 
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
  const attemptsLimit = 5000;
  let attempts = 0;
  while (houses.length < HOUSE_COUNT && attempts < attemptsLimit) {
    const x = Math.random() * (WIDTH - HOUSE_WIDTH);
    const y = HEIGHT - HOUSE_HEIGHT - HOUSE_MARGIN_BOTTOM;
    const rect = { x, y, width: HOUSE_WIDTH, height: HOUSE_HEIGHT };

    let overlapSameSpot = false;
    for (const h of houses) {
      const samePos = Math.abs(h.x - rect.x) < 1 && Math.abs(h.y - rect.y) < 1;
      if (samePos) { overlapSameSpot = true; break; }
    }
    if (!overlapSameSpot) houses.push(rect);
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

  if (isAnalyzing) {
    statusEl.textContent = '狀態: 🎵 音樂解析中，請稍候...';
  } else if (!gameStarted) {
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

function gameLoop() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  if (!gameStarted) {
    if (backgroundImg.complete && backgroundImg.naturalWidth > 0) {
      ctx.drawImage(backgroundImg, 0, 0, WIDTH, HEIGHT);
    } else {
      ctx.fillStyle = '#003366'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#FFF'; ctx.font = '48px Arial'; ctx.textAlign = 'center';
    if (!gesturesLoaded) {
      ctx.fillText('正在載入詞彙，請稍候...', WIDTH / 2, Math.max(HEIGHT / 2, 50));
    } else {
      ctx.fillText('按 Enter 鍵開始遊戲', WIDTH / 2, Math.max(HEIGHT / 2, 50));
    }
    updateHud();
    requestAnimationFrame(gameLoop);
    return;
  }

  frameCounter += 1;

  if (backgroundImg.complete && backgroundImg.naturalWidth > 0) {
    ctx.drawImage(backgroundImg, 0, 0, WIDTH, HEIGHT);
  } else {
    ctx.fillStyle = '#003366'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  const camX = WIDTH - 260; const camY = 10;
  const camW = 240; const camH = 180;

  if (lastVideoFrame) {
    ctx.save();
    ctx.translate(camX + camW, camY); ctx.scale(-1, 1);
    ctx.drawImage(lastVideoFrame, 0, 0, camW, camH);
    ctx.restore();
  }

  ctx.strokeStyle = '#0f0'; ctx.lineWidth = 2;
  ctx.strokeRect(camX, camY, camW, camH);

  if (lastHandLandmarks && lastHandLandmarks.length > 0) {
    ctx.fillStyle = '#0f0';
    for (const hand of lastHandLandmarks) {
      for (const lm of hand) {
        const xNorm = 1 - lm.x; 
        const x = camX + xNorm * camW;
        const y = camY + lm.y * camH;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  if (!gameOver) {
    plane.move();

    if (gameStarted) {
      let currentTime = bgmPlayer.currentTime + AUDIO_OFFSET;
      let dropDistance = HEIGHT - HOUSE_HEIGHT - 150; 
      let travelTime = dropDistance / (Bomb.SPEED * 60); 
      let lookAheadTime = currentTime + travelTime;

      while (currentBeatIndex < musicBeats.length && lookAheadTime >= musicBeats[currentBeatIndex].time) {
        let targetLane = musicBeats[currentBeatIndex].lane;
        let usableWidth = WIDTH - 260; 
        let laneX = (usableWidth / 3) * targetLane + (usableWidth / 6) - (Bomb.WIDTH / 2);

        plane.x = laneX; 
        
        let targetTime = musicBeats[currentBeatIndex].time;
        let spawnTime = targetTime - travelTime;
        let timeOverdue = currentTime - spawnTime;
        let offsetY = Math.max(0, timeOverdue * (Bomb.SPEED * 60));
        
        const dropY = plane.y + plane.height - 30 + offsetY;
        bombs.push(new Bomb(laneX, dropY, targetTime));
        
        totalBombsDropped += 1;
        currentBeatIndex += 1; 
      }
    }
  }

  ctx.fillStyle = '#ffaa00';
  for (const h of houses) {
    if (houseImg.complete && houseImg.naturalWidth > 0) {
      ctx.drawImage(houseImg, h.x, h.y, h.width, h.height);
    } else {
      ctx.fillRect(h.x, h.y, h.width, h.height);
    }
  }

  if (!gameOver) {
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i];
      b.fall();
      b.render(ctx);

      const bombBottom = b.y + Bomb.HEIGHT;
      let hitAnyHouse = false;

      for (let hi = 0; hi < houses.length; hi++) {
        const h = houses[hi];
        const collideX = b.x < h.x + h.width && b.x + Bomb.WIDTH > h.x;
        const collideY = b.y < h.y + h.height && bombBottom > h.y;
        if (collideX && collideY) {
          hitAnyHouse = true; break;
        }
      }

      if (!b.impactResolved && !b.shrinking && !b.exploding && (hitAnyHouse || bombBottom >= HEIGHT)) {
        let error = Math.abs(bgmPlayer.currentTime - b.targetTime);
        console.log(`[誤差測試] 目標: ${b.targetTime.toFixed(3)}s | 實際: ${bgmPlayer.currentTime.toFixed(3)}s | 誤差: ${error.toFixed(3)} 秒`);
        b.startShrink(true);
        if (houses.length > 0) {
          const idx = Math.floor(Math.random() * houses.length);
          houses.splice(idx, 1);
          if (houses.length === 0) {
            gameOver = true; win = false;
          }
        }
      }

      if (!b.shrinking && !b.exploding && (b.finished || b.shrinkTimer > Bomb.MAX_SHRINK_TIME)) {
        bombs.splice(i, 1);
      }
    }

    if (!gameOver && totalBombsDropped >= TARGET_BOMBS && bombs.length === 0 && houses.length > 0) {
      gameOver = true; win = true;
    }
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = win ? '#00ff00' : '#ff0000';
    ctx.font = '48px Arial'; ctx.textAlign = 'center';
    ctx.fillText(win ? '勝利！' : '失敗', WIDTH / 2, HEIGHT / 2 - 20);
    ctx.fillStyle = '#FFF'; ctx.font = '32px Arial';
    ctx.fillText('按 Enter 鍵重新開始', WIDTH / 2, HEIGHT / 2 + 40);
  }

  plane.render(ctx);
  updateHud();
  requestAnimationFrame(gameLoop);
}

async function initWebcam() {
  if (!window.Hands || !window.Camera) {
    statusEl.textContent = '狀態: 無法載入 MediaPipe Hands（仍可遊玩）';
    return;
  }

  statusEl.textContent = '狀態: 正在載入 AI 引擎...';

  const hands = new window.Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  hands.onResults((results) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      lastHandLandmarks = results.multiHandLandmarks; 
      if (gameStarted && !gameOver) updateDynamicGesture(results);
    } else {
      lastHandLandmarks = null;
      if (gameStarted && !gameOver) updateDynamicGesture(null);
    }
    if (results.image) lastVideoFrame = results.image;
    isProcessingFrame = false;
  });

  const camera = new window.Camera(video, {
    onFrame: async () => {
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

  // 🛑 防線三：使用 Try-Catch 攔截攝影機權限與硬體錯誤
  try {
    await camera.start();
    statusEl.textContent = '狀態: 已連線攝像頭（可進行手勢偵測）';
  } catch (error) {
    console.error("攝影機啟動失敗:", error);
    if (error.name === 'NotAllowedError' || error.message.includes('Permission')) {
        alert("你拒絕了攝影機權限喔！請在網址列旁邊點擊鎖頭圖示解鎖攝影機，然後重新整理網頁。");
    } else if (error.name === 'NotFoundError' || error.message.includes('Device not found')) {
        alert("找不到攝影機！請確認你的電腦有連接視訊鏡頭。");
    } else {
        alert("攝影機啟動失敗，請確認沒有其他程式 (如 Zoom) 正在佔用攝影機。");
    }
    statusEl.textContent = '狀態: 無法存取攝影機（仍可遊玩）';
  }
}

function initGame() {
  initHouses();
  plane = new Plane();

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
      e.preventDefault();

      if (musicBeats.length === 0 || isAnalyzing) {
        alert("請先上傳音樂並等待解析完成喔！");
        return; 
      }

      if (!gameStarted) {
        if (!gesturesLoaded) return; 
        gameStarted = true;
        bgmPlayer.play(); 
      } else if (gameOver) {
        gameStarted = true;
        gameOver = false;
        win = false;
        bombs = [];
        totalBombsDropped = 0;
        initHouses();
        plane = new Plane();
        resetGestureSequence();
        currentBeatIndex = 0;
        bgmPlayer.currentTime = 0;
        bgmPlayer.play();
      }
    }

    if (e.code === 'Space' && !gameOver && gameStarted) {
      if (bombs.length > 0) {
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
