//timestamp
//加入一個index0~1000跑
//const timestamp = 1716717600000; 
//const date = new Date(timestamp);
//esp32有記憶體限制，時間跑到一定數會歸0
//realtme

let CONFIG = {}; // 用來存放設定參數

let table;      // 宣告變數table
let img;        // 宣告變數img

let CSVData = [];
let songList = []; // 用來存放從 MySQL 取得的歌曲資料的陣列
let CutsceneImg = [];  
let cutsceneImgsList = []; // 用來存放從 過場圖片資料的陣列
let Notes = []; // 用來存放所有音符的陣列
let Drags = []; // 用來存放所有拖曳音符的陣列
let Rotates = []; // 用來存放所有旋轉音符的陣列
let songName = ""; // 用來存放當前歌曲名稱的變數
let opObj ; // 用來存放op物件
let bgm1Obj; // 用來存放bgm1物件
let selectEffect; // 用來存放選歌特效物件 
let songJudgeText; // 用來存放歌曲判定文字物件
let songComboText; // 用來存放歌曲combo文字物件
let settlement;   // 用來存放結算物件
let gameEffect;   // 用來存放遊戲效果物件


let pass3_5Timer ; 
let passSongSelectPageTimer ; //翻頁計時器
let statusEntryTimer          //翻頁初始冷卻計時器

  
let isplaying = false; // 用來追蹤status是否已經變成 2
let isLoad = false; // 用來追蹤過場動畫是否已經載入過

let angle = 0; // 用來存放玩家當前的角度
let botton = 0; // 用來存放玩家當前的按鈕狀態
let lastBotton = 0; // 用來偵測按鈕上升沿，只觸發一次

// 判定文字顯示系統
let JudgeTexts = []; // 存儲所有正在顯示的判定文字
let cutsceneTextData = null;
let CutsceneText = []; // 用於存儲正在顯示的字幕物件

let status = -1; 
let isSandMySQL = false; // 用來追蹤是否已經向伺服器請求過 MySQL 資料

let isReSetTime = false; // 用來追蹤是否已經重置過時間
let perTime = 0; // 用來存放重置時間的值
let nowTime = 0; // 用來存放當前時間的值




function setup() {
  createCanvas(CONFIG.canvas.width, CONFIG.canvas.height);
  noCursor();
  CSVData = getCSVData();
  websocketSetup(); // 初始化 WebSocket 連線

  setSounds(); // 預先載入聲音檔案

    let size = CONFIG.uslNoteSetting.judgeLine;
    let pg = createGraphics(size, size);
    pg.ellipse(size / 2, size / 2, size, size);

    for (let rawImg of cutsceneImgsList) {
        let tempImg = rawImg.get();
        // 如果原始圖片比例不是 1:1，建議先 resize
        tempImg.resize(size, size); 
        tempImg.mask(pg);
        preMaskedImgs.push(tempImg);
    }
    pg.remove(); // 釋放畫布

    
pass3_5Timer = new Timer(); // 3.5過門計時器
passSongSelectPageTimer = new Timer(); // 翻頁計時器
statusEntryTimer = new Timer(); // 翻頁初始冷卻計時器

opObj = new OpObj('op'); // 初始化op物件
bgm1Obj = new Bgm1Obj('bgm1'); // 初始化bgm1物件
settlement = new Settlement(); // 初始化結算物件
selectEffect = new SelectEffect(); // 初始化選歌特效物件
songJudgeText = new SongJudgeText(); // 初始化歌曲判定文字物件
songComboText = new SongComboText(); // 初始化歌曲combo文字物件
gameEffect = new GameEffect(); // 初始化遊戲效果物件
}



function draw() {
  background(...CONFIG.display.backgroundColor);
  frameRate(CONFIG.display.frameRate);

  // 狀態切換觸發器：當 status 變化時，觸發對應的音樂播放或停止
  if (typeof prevStatus === 'undefined') prevStatus = status;
  if (status !== prevStatus) {
    // if (opObj) opObj.update(1);   
    if (bgm1Obj) bgm1Obj.update(3);   
    if (status === 1) {
      loadSongMenu(); // 確保只在狀態切換時呼叫一次，而不是每個 frame 呼叫
    }
    prevStatus = status;
  }

  let time = millis(); 
push(); 
  noFill();
  stroke(50);
  circle(width / 2, height / 2, CONFIG.uslNoteSetting.lifeLine);   //音符生命線
pop();

console.log("status", status);

const isHitPressed = botton === 1 && lastBotton !== 1;
if (isHitPressed) {
  playSound('hit');
}


  if(status == -1){
    pushHint();
  }

  if(status == 0){
    startLogic();
     endSong();
  }

  if(status == 1){
    time = millis();

    selectSong();
    playerMark();
    if (songList.length > 0) { 
        for(let i = 0; i < songList.length; i++) {
            songList[i].update();
        }
    }
    drawSongMenu( CONFIG.songSelectMenu.songPage, CONFIG.songSelectMenu.songQuantity);

    gameEffect.resetGameEffect(); // 重置遊戲效果的淡入狀態，為下一次進入做準備
  }

  if(status == 2 || status == 2.5){

    isReSetTime = false; // 重置翻頁邏輯的時間重設定狀態，為下一次進入做準備
    
    if (!isplaying && song && status !== 2.5) {
        song.play();
        settlementRadiusAnima = {}; // 重製結算頁面動畫的半徑變量
        mySettlement.reset(); 
        isplaying = true;

        
    }

     if (song && !song.paused) {
    time = song.currentTime * 1000;
  }

    if(status == 2 && botton == 1 && time > 3000){ 
      status = 2.5;
      botton = 0; // 立即消耗按鈕狀態，防止同一幀內觸發 pause() 的選項
    }

    
    gameEffect.maskedGameImage(); // 顯示遊戲底圖

push();
      noFill();

      // 更新和顯示判定文字
      for (let i = JudgeTexts.length - 1; i >= 0; i--) {
        if (!JudgeTexts[i].update()) {
          JudgeTexts.splice(i, 1); // 移除已過期的文字
        } else {
          JudgeTexts[i].display();
        }
      }

      
      // 更新和顯示 drag 音符
      for (let i = 0; i < Drags.length; i++) {
        Drags[i].display(time);
      }

      if(song && !song.paused) {
      for (let i = 0; i < Notes.length; i++) {
        Notes[i].update(time);
        Notes[i].display(time);
      }

      for (let i = 0; i < Rotates.length; i++) {
        Rotates[i].update(time);
        Rotates[i].display(time);
      }

      playerMark();
    } else if(status == 2.5 && song && song.paused) {
      time = song.currentTime * 1000; // 使用暫停時的時間來更新音符位置
      // 暫停時也顯示音符，使用暫停時的時間
      for (let i = 0; i < Notes.length; i++) {
        Notes[i].update(time);
        Notes[i].display(time);
      }

      for (let i = 0; i < Drags.length; i++) {
        Drags[i].display(time);
      }

      for (let i = 0; i < Rotates.length; i++) {
        Rotates[i].update(time);
        Rotates[i].display(time);
      }
    }
    
pop();

  }

  if (song && song.paused && status == 2){
      status = 3;
    }

    
  if(status == 3){
    drawSettlement();
    bgm1Obj.update(3);
    prevStatus = true;
    cutscene();
  }

    // 在 draw() 的 status == 3.5 邏輯中修改
if (status == 3.5) {
    if (!isLoad) {
        CutsceneText[0] = new cutsceneText(-PI);
        CutsceneImg[0] = new cutsceneImg();
        isSettlementImgPrepared = false; // 確保過場圖片在每次進入時都會重新準備
        isLoad = true;
    }
    CutsceneImg[0].display();
    song.pause();

    if (pass3_5Timer.upDate(CONFIG.cutsceneText.duration)) {
        // --- 修正處：進入 status 1 前的大掃除 ---
        status = 1;
        hasInitializedMenu = false; // 告訴 selectSong 需要重新初始化
        // ------------------------------------
        CutsceneText = []; 
        CutsceneImg = [];
        isLoad = false;
    }
}

  if(status == 2.5){
    pause();
    isplaying = false;
}
  lastBotton = botton; // 更新上一幀的按鈕狀態


  if(status !== 2 && status !== 3 && status !== 2.5) {
    CONFIG.score.combo = 0;
        CONFIG.score.prefect = 0;
        CONFIG.score.great = 0;
        CONFIG.score.miss = 0;
        isplaying =false;
  }


  console.log(CONFIG.songSelectMenu.songPage);
}


//================================================================
// 公用函數========================================================
// ===============================================================

// 用於結束歌曲的函數
function endSong(){
 if (song && !song.paused) {
            song.pause();
            song.currentTime = 0;
        }
}

// 用於計時的函數
class Timer {
    constructor() {
        this.perTime = 0;
        this.isRunning = false;
    }

    // 觸發一次性的計時 (類似你原本的邏輯)
    upDate(ms) {
        if (!this.isRunning) {
            this.perTime = millis();
            this.isRunning = true;
        }
        if (this.isRunning && millis() - this.perTime >= ms) {
            this.isRunning = false; // 自動重置
            return true;
        }
        return false;
    }
}


// 用於過場的黑幕
class OpacityMask {
    constructor(sp) {
        this.speed = sp;
        this.reset();
    }

    // 增加 reset 方法以便物件複用，避免 GC 壓力
    reset() {
        this.opacity = 255;
        this.isOut = false;
        this.isHolding = false;
        this.isFinished = false;
        this.startTime = 0;
    }

    update() {
        if (this.isFinished) return this.opacity;

        let currentTime = millis();

        if (!this.isOut) {
            if (!this.isHolding) {
                // 1. 淡入
                this.opacity -= this.speed;
                if (this.opacity <= 0) {
                    this.opacity = 0;
                    this.isHolding = true;
                    this.startTime = currentTime;
                }
            } else {
                // 2. 停留
                if (currentTime - this.startTime >= 1000) { 
                    this.isOut = true;
                }
            }
        } else {
            // 3. 淡出
            this.opacity += this.speed;
            if (this.opacity >= 255) {
                this.opacity = 255;
                this.isFinished = true;
            }
        }
        return this.opacity;
    }
}

// 用於計算全局旋轉角度的函數 
let allAngle = 0;
function stillAllRun(s){
  allAngle += s;

  return allAngle;
}