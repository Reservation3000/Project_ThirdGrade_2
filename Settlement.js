
    //     stopRadius= CONFIG.pause.radius;

    // // 讓 radiusAnima ++ CONFIG.pause.radius
    // if (radiusAnima < CONFIG.pause.selectRadius) {
    //     radiusAnima += (CONFIG.pause.selectRadius - radiusAnima) * 0.1;
    // }

    // 極座標
    //每個文字在畫面上對齊圓周的 $(x, y)$ 座標是由極座標公式轉換
    // X = certerX + cos(angle) * radius
    // Y = certerY + sin(angle) * radius
    // 其中 angle 是每個文字的角度位置，radius 是文字距離圓心的距離

    // easing 公式
    //Vnext = Vcurrent + (Vtarget - Vcurrent) * easingFactor


// ==================== 【優化 1】將實例與變數移至全域 ====================
let mySettlement = null;
let cachedSettlementImg = null; // 用來儲存只裁切一次的結算圖片
let isSettlementImgPrepared = false; 

class Settlement extends Song {
  constructor() {
    super();
    mySettlement = this;  // 設定全域的 mySettlement 變數
    this.valueProgress = {};  // 1. 數字動畫倉庫
    this.radiusProgress = {}; // 2. 半徑動畫倉庫
  }

  display(str, radiansAngle, centerAngleDegrees, radius, textSizeValue, alpha) {
    // ================== 數字動畫處理 ==================
    let finalDisplayStr = str;
    if (typeof str === "number") {
        let numKey = centerAngleDegrees + "_" + radius; // Key
        if (this.valueProgress[numKey] === undefined) this.valueProgress[numKey] = 0;
        
        if (this.valueProgress[numKey] < str) {
            this.valueProgress[numKey] += (str - this.valueProgress[numKey]) * 0.01;
        } else {
            this.valueProgress[numKey] = str;
        }
        finalDisplayStr = Math.round(this.valueProgress[numKey]);
    }

    // ================== 半徑動畫處理 ==================
    if (this.radiusProgress[radius] === undefined) {
        this.radiusProgress[radius] = 0;
    }
    if (this.radiusProgress[radius] < radius) {
        this.radiusProgress[radius] += (radius - this.radiusProgress[radius]) * 0.04;
    } else {
        this.radiusProgress[radius] = radius; 
    }
    let currentAnimRadius = this.radiusProgress[radius];

    // ================== 畫字邏輯 ==================
    let textString = String(finalDisplayStr); 
    let chars = textString.split(""); 
    let count = chars.length;
    let angleSpacing = radians(radiansAngle); 
    let totalAngleSpan = angleSpacing * (count - 1);
    let startAngle = radians(centerAngleDegrees) - (totalAngleSpan / 2);

    push();
    translate(width / 2, height / 2); 
    textAlign(CENTER, CENTER);
    textSize(textSizeValue); 
    noStroke();
    fill(255, alpha); 

    // 極座標轉換
    for (let i = 0; i < count; i++) {
        let angle = startAngle + (i * angleSpacing); 
        let x = cos(angle) * currentAnimRadius; 
        let y = sin(angle) * currentAnimRadius;
        push();
        translate(x, y);
        rotate(angle + HALF_PI); 
        text(chars[i], 0, 0);
        pop();
    }
    pop();
  }

  // 這樣一來，重置按鈕也超級好寫，直接清空物件內部的兩個倉庫就好
  reset() {
    this.valueProgress = {};
    this.radiusProgress = {};
  }
}

// ==================== 【優化 2】遮罩一輩子只需要做一次 ====================
function prepareMaskedSettlementImage() {
    if (!img || isSettlementImgPrepared) return;

    let r = CONFIG.settlement.SongImgRadius;
    let maskImg = createGraphics(r, r);
    maskImg.fill(255);
    maskImg.noStroke();
    maskImg.circle(r / 2, r / 2, r);

    cachedSettlementImg = img.get(); 
    cachedSettlementImg.mask(maskImg);
    maskImg.remove(); // 釋放記憶體
    
    isSettlementImgPrepared = true; // 鎖定，下次直接跳過不執行
}



// 圖片
function drawSettlementImage() {
    if (!cachedSettlementImg) return;
    let r = CONFIG.settlement.SongImgRadius;

    push();
        translate(width / 2, height / 2 - r); 
        rotate(radians(angValue * 0.3));
        
        // 畫黑底圓圈
        fill(0);
        noStroke();
        drawingContext.shadowBlur = 20; 
        drawingContext.shadowColor = `rgb(255, 255, 255, 0.5)`;
        circle(0, 0, r + 20); 
        
        drawingContext.shadowBlur = 0;
        imageMode(CENTER);
        image(cachedSettlementImg, 0, 0, r, r);
    pop();
}

// 底圓
function settlementBottonCircle(){
    push();
        noStroke();
        translate(width / 2, height / 2);
        fill`rgb(48, 52, 55)`;
        circle(0, 0, CONFIG.pause.selectRadius + 100);
        fill(0);
        circle(0, 0, CONFIG.pause.selectRadius - 200);
    pop();
}

// 大裝飾弧線
function settlementBigDecorateArc(){
    push();
        noFill();
        stroke(255);
        strokeWeight(2);
        translate(width / 2, height / 2);
        rotate(radians(angValue * 0.6));
        let arcSize = CONFIG.settlement.SongImgRadius * 3.1;
        arc(0, 0, arcSize, arcSize, radians(20), radians(160));
        arc(0, 0, arcSize, arcSize, radians(200), radians(340));
    pop();
}

// 小裝飾弧線
function settlementSmallDecorateArc(){
    push();
        noFill();
        stroke(255);
        strokeWeight(1);
        translate(width / 2, height / 2 - CONFIG.settlement.SongImgRadius);
        rotate(radians(angValue));
        let arcSize = CONFIG.settlement.SongImgRadius + 40;
        arc(0, 0, arcSize, arcSize, radians(20), radians(160));
        arc(0, 0, arcSize, arcSize, radians(200), radians(340));
    pop();
}


// 分數顯示
function drawSettlement() {
    // 如果實例不存在才創建（只會執行一次）
    if (!mySettlement) {
        mySettlement = new Settlement();
    }
    
    // 預先處理遮罩（內部有鎖，只有進結算第一幀會真正跑像素計算）
    prepareMaskedSettlementImage(); 
    
    scoreDisplay(); 
    
    push();
    textStyle(BOLD);
    angValue += CONFIG.pause.rotateSpeed; 

    settlementBottonCircle(); // 底圓

    // 歌曲名稱
    mySettlement.display(songName, 7, angValue * 0.4, CONFIG.settlement.SongImgRadius, 30);  
    mySettlement.display(songName, 7, angValue * 0.4 + 180, CONFIG.settlement.SongImgRadius, 30);  
    pop();

    settlementBigDecorateArc();  // 大裝飾弧
    drawSettlementImage();        // 【優化】直接繪製快取好的一般圖片，FPS 直接拉滿！
    settlementSmallDecorateArc(); // 小裝飾弧

    // 分數資料 (半徑 350 組)
    textStyle(BOLD);
    textFont('Montserrat');
    mySettlement.display(CONFIG.score.scoreTotal, 5, 330, 350, 40, 255);   
    mySettlement.display(CONFIG.score.miss, 5, 220, 350, 40, 255);
    if(CONFIG.score.miss == 0){CONFIG.score.hitRate = 100}  
    mySettlement.display(CONFIG.score.hitRate.toFixed(0) + "%", 5, 30, 350, 40, 255); 
    mySettlement.display(CONFIG.score.prefect, 5, 140, 350, 40, 255); 
    mySettlement.display(CONFIG.score.great, 5, 180, 350, 40, 255);    
    
    // 標題項目 (半徑 400 組)
    textStyle(NORMAL);
    textFont('Montserrat');
    mySettlement.display("SCORE", 5, 330, 400, 40, 150); 
    mySettlement.display("HIT%", 5, 30, 400, 40, 150); 
    mySettlement.display("PERFECT", 5, 140, 400, 40, 150);
    mySettlement.display("GREAT", 5, 180, 400, 40, 150);
    mySettlement.display("MISS", 5, 220, 400, 40, 150);   
}

function easingSettlementScore(current, target, factor) {
    return current + (target - current) * factor;
}





