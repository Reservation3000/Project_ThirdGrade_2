let firstLineInt;
let song; // 用來存放音樂檔案的變數
let hit;
let op;
let bgm1;
let preMaskedImgs = []; // 用來存放預處理好的遮罩圖片

// 載入資料==========================================================
function preload() {
  CONFIG = loadJSON('setting.json');   //載入設定檔案

  for (let i = 0; i < 11; i++) { 
        let img = loadImage(`otherData/picturtGet/base${i}.jpg`, 
            () => console.log(`圖片 ${i} 載入成功`),
            () => console.error(`圖片 ${i} 載入失敗`)
        );
        cutsceneImgsList.push(img);  //
    }
}


// Websocket setup==========================================================
let socket; 
let sensorObj = { yaw: 0 }; // 預設資料結構

function websocketSetup() {
  socket = new WebSocket(CONFIG.websocket.serverAddress); 
  
  try {
    // 【偵查成功】
    socket.onopen = () => {
      console.log(" WebSocket 連線成功！");
      // 連線後執行一次註冊
      const registerMsg = { type: "Web" };
      socket.send(JSON.stringify(registerMsg));
    };

    // 【偵查失敗/錯誤】
    socket.onerror = (error) => {
      console.error(" WebSocket error）:", error);
    };

    // 【偵查斷開】
    socket.onclose = (event) => {
      console.warn(`WebSocket disconnect: ${event.code}, reason: ${event.reason}`);
      // 清理現有的 WebSocket 物件
      if (socket) {
        socket.onopen = null;
        socket.onerror = null;
        socket.onclose = null;
        socket = null; 
      }

      //重連機制
      setTimeout(() => { 
        console.log("Try reconnection...");
        websocketSetup();
      }, 5000); 
    };

  } catch (e) {
    console.error(" WebSocket obj create error:", e);
  }
  
  // 讀取訊息的核心：onmessage
  socket.onmessage = (event) => {
    // 讀取從 server.js 廣播過來的內容
    // 將收到的 JSON 字串轉成 JS 物件
    try {
      sensorObj = JSON.parse(event.data);
      angle = -sensorObj.yaw; // 更新 angle 變量
      botton = sensorObj.bottonstatus; // 更新 botton 變量
    } catch (e) {
      console.log("收到非 JSON 格式的消息:", event.data);
    }
  };
  
  socket.onerror = (err) => console.log("Socket Error:", err);
  socket.onclose = () => console.log("WebSocket 連線已關閉");
}


// angle=====================================================================
let lastAngle = 0;
let totalAngle = 0;

function angleCount_360(){     // 0~180~-180轉 累積角度計算函數
  // 檢查 angle 是否為有效數字
  if (!Number.isFinite(angle)) {
    return 0;
  }
  
  let delta = angle - lastAngle;

   if (delta > 180) {        
    delta -= 360;
  } else if (delta < -180) {
    delta += 360;
  }

  totalAngle += delta;
  lastAngle = angle;

  return totalAngle;
}


function angleCount_360L(){
  let angle = ((angleCount_360() % 360) + 360) % 360; // 累計角度轉換為 0~360 度圓內
  return angle ;
    
}

function angleCount_360RL(){
  let angle = radians(angleCount_360L());  // 轉換為弧度
  return angle ;
}



// 抓取歌曲清單==========================================================
async function loadSongMenu() {
    if (songList.length > 0) return; // 已經有歌曲就不再抓取
    try {
        // 發送 HTTP 請求
        const response = await fetch('http://localhost:3000/api/songs'); 
        const songs = await response.json(); // 拿到資料庫裡的陣列

        songs.forEach(data => {

            //建立歌曲物件，並存入 songList 陣列
            let newSong = new Song( data.id, 
                                    data.name, 
                                    data.song_artist,  
                                    data.sheet_artist, 
                                    data.level, 
                                    data.bpm, 
                                    data.mp3, 
                                    data.csv, 
                                    data.jpg
                                  );
                                  
            songList.push(newSong);
        });
        
        console.log("GetSongs success:", songList);
    } catch (error) {
        console.error("GetSongs error:", error);
    }
}


// 讀取CSV資料==========================================================
function getCSVData() {
  if (!table) { return []; }
  
  // 讀取第一行的整數數字
  firstLineInt = table.getNum(0, 0);
  console.log("First line integer:", firstLineInt);

  let data = [];
  let rowCount = table.getRowCount();
  
  // 從第二行開始讀取資料 (i = 1)
  for (let i = 1; i < rowCount; i++) {
    let type = table.getString(i, 0);  // 第一欄：類型
    
    if(type === 'note') {
      let triggerTime = table.getNum(i, 1)+firstLineInt;  // 加上第一行的整數數字
      let noteLand = table.getNum(i, 2);  
      data.push({ type, triggerTime, noteLand });
    } 
    else if(type === 'drag') {
      let triggerTimeStart = table.getNum(i, 1)+firstLineInt;  // 加上第一行的整數數字
      let triggerTimeEnd = table.getNum(i, 2)+firstLineInt;  // 加上第一行的整數數字
      let noteLandStart = table.getNum(i, 3);
      let noteLandEnd = table.getNum(i, 4);
      let direction = table.getNum(i, 5);  // 方向
      data.push({ type, triggerTimeStart, triggerTimeEnd, noteLandStart, noteLandEnd, direction });
    }else if(type === 'rotate') { 
      let triggerTime = table.getNum(i, 1)+firstLineInt;  // 加上第一行的整數數字
      let direction = table.getNum(i, 2);  // 方向
      data.push({ type, triggerTime, direction });
    }
  }
  
  return data;
}


// 載入音效==========================================================
let audioCtx;
let sounds = {}; // 用來存放所有載入好的音效
// 初始化 AudioContext 並預載入音效
function setSounds() {
    audioCtx = getAudioContext();  // 使用 p5.js 的 getAudioContext() 來確保兼容性
    
    const soundFiles = {
        hit: 'otherData/picturtGet/hit.mp3',
        op:  'otherData/picturtGet/Cycotation.mp3',
        bgm1:'otherData/picturtGet/bgm1.mp3'
    };

    initAllSounds(soundFiles);
  }

async function initAllSounds(files) {
    try {
        // 將所有 fetch 任務轉為 Promise 陣列
        const promises = Object.keys(files).map(async (key) => {
            const response = await fetch(files[key]);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            sounds[key] = audioBuffer; // 存入物件中
            console.log(`音效 [${key}] 載入成功`);
        });

        await Promise.all(promises);
        console.log("所有原生音訊已就緒！");
    } catch (e) {
        console.error("部分音訊載入失敗:", e);
    }
}


function playSound(name) {
    // 每次播放只建立一個簡單的 BufferSource，播完會自動銷毀
    if (!sounds[name] || !audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const source = audioCtx.createBufferSource();
    source.buffer = sounds[name];
    source.connect(audioCtx.destination);
    source.start(0);

  return source;
}

// 初始化音符==========================================================
function initializeNotes() {
  Notes = [];      // 清空舊的音符
  Drags = [];      // 清空舊的拖曳
  Rotates = [];    // 清空舊的旋轉
  
  for (let i = 0; i < CSVData.length; i++) {
    const row = CSVData[i];
    
    if(row.type === 'note') {
      Notes.push(new note(row.triggerTime, row.noteLand));
    }
    else if(row.type === 'drag') {
      Drags.push(new drag(row.triggerTimeStart, row.noteLandStart, row.triggerTimeEnd, row.noteLandEnd, row.direction));
    }else if(row.type === 'rotate') {
      Rotates.push(new Rotate(row.triggerTime, row.direction));
    }
  }
}



class SoundStateObj {
  constructor(soundName) {
    this.soundName = soundName; 
    this.isTrigger = false;
    this.source = null;
  }

  stopSound() {
    if (this.source) {          
      this.source.stop();
      this.source.disconnect(); // 斷開連接以釋放資源
      this.source = null;       // 刪除存在 this.source 中的物件
    }
  }

  update(targetStatus) {
    if (status === targetStatus) {   // 是否status與傳入的數字(狀態)相同
      if (!this.isTrigger) { 
        this.stopSound();            // 確保之前的音效已停止
        this.source = this.play();   // 播放新的音效，並保存此物件至 this.source
        this.isTrigger = true;  
      }
    }else {
        this.stopSound();
        this.isTrigger = false;  
    }
  }

  play() {

  }
}

// op
class OpObj extends SoundStateObj {
  constructor(songName) {
    super(songName); // 傳入音效名稱給父類別
  }

  play() {
    let src = playSound(this.soundName);
    return src;
  }
}

// BGM 
class Bgm1Obj extends SoundStateObj {
  constructor(songName) {
    super(songName); // 傳入音效名稱給父類別
  }

  play() {
    let src = playSound(this.soundName);
    if (src) {
      src.loop = true; // bgm loop
    }
    return src;
  }
}