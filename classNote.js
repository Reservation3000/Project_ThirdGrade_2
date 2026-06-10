class note extends Inote {
    constructor(triggerTime, noteLand) {
    super();
    this.triggerTime = triggerTime;
    this.noteLand = noteLand;
    this.noteSpeed = CONFIG.uslNoteSetting.speed;
    this.notePosition = CONFIG.uslNoteSetting.initialPosition;
    this.noteStrokeWeight = CONFIG.note.noteStrokeWeight;

    this.startPosition = CONFIG.uslNoteSetting.initialPosition;
    this.endPosition = CONFIG.uslNoteSetting.judgeLine;
    this.lifePosition = CONFIG.uslNoteSetting.lifeLine;

    this.isActive = false;  //是否已啟動
    this.judgeStyle = 0;  // 0: 未判定, 1: Perfect, 2: Good, 3: Miss  
    this.isJudged = false;

    this.requiredMs = 0;
    this.elapsedMs = 0;

  }

  update(time) {

    // 計算到達 lifeLine 所需的時間（毫秒）
    const requiredMs = (this.startPosition - this.endPosition) / this.noteSpeed * (1000 / CONFIG.display.frameRate);
    
    // 計算從音符應該開始移動的時間點到現在，經過了多少毫秒
    const elapsedMs = time - (this.triggerTime - requiredMs);

    if (elapsedMs < 0) {
      // 還沒到啟動時間
      this.isActive = false;
      this.notePosition = CONFIG.uslNoteSetting.initialPosition;
    } else {
      // 已經啟動，根據經過的時間計算精確位置 (Frame-Independent)
      this.isActive = true;
      const elapsedFrames = elapsedMs / (1000 / CONFIG.display.frameRate);
      this.notePosition = CONFIG.uslNoteSetting.initialPosition - this.noteSpeed * elapsedFrames;
    }

    // 如果超出了螢幕 (小於 lifeLine)，則停止活動
    if (this.notePosition <= this.lifePosition) {
      this.isActive = false;
    }


    //如果音符超過great判定區域，開啟判定
    if (!this.isJudged){
      // 將音符和玩家的角度都轉換為 0~360 度，以利比對
     
      // // 檢查目前的音符是不是「畫面上最前面、且還沒被判定的音符」
      // let targetNote = Notes.find(n => n.isActive && !n.isJudged);

      // if (targetNote === this) {
      //   push();
      //   fill(255, 0, 0); 
      //   noStroke();
      //   textSize(24);
      //   text("Note: " + noteAngleDeg.toFixed(1) + "°", 100, 600);
      //   text("Player: " + playerAngleDeg.toFixed(1) + "°", 100, 650);
      //   text("Diff: " + angleDiff.toFixed(1) + "°", 100, 700);
      //   pop();
      // }

      //miss不受角度干擾
      if (this.notePosition <= this.lifePosition) {
        this.judgeStyle = 3; 
      }
      else if (this.notePosition < this.endPosition)
      {
        if(Math.abs(this.getNoteAngleDiff()) <= CONFIG.uslNoteSetting.prefectRange) {
          this.judgeStyle = 1; 
        } else if(Math.abs(this.getNoteAngleDiff()) <= CONFIG.uslNoteSetting.greatRange) {
          this.judgeStyle = 2; 
        } 
      }
     

       switch(this.judgeStyle) {
      case 1:
         this.isJudged = true;
         this.isActive = false;
         CONFIG.score.combo++;
         CONFIG.score.prefect++;
         playSound('hit');
         addJudgeText(1); 
        break;
      case 2:
         this.isJudged = true;
         this.isActive = false;
         CONFIG.score.combo++;
         CONFIG.score.great++;
         playSound('hit');
         addJudgeText(2); 
        break;
      case 3:
         this.isJudged = true;
         this.isActive = false;
        CONFIG.score.miss++;
         CONFIG.score.combo = 0; // 重置連擊數
         addJudgeText(3); 
        break;
    }
    }

   
  }

    display(time) {
    if(this.isActive && !this.isJudged &&  this.notePosition >= 0) {
      // 初始角度寬度
      const arcWidth = TWO_PI / CONFIG.note.arcWidthValue;
      const centerAngle = this.getNoteCenterAngle();  
      const startAngle = centerAngle - arcWidth / 2;
      const endAngle = centerAngle + arcWidth / 2;
      
      push();
      strokeWeight(this.noteStrokeWeight);
      stroke(...CONFIG.note.strokeColor);
      arc(width / 2, height / 2, this.notePosition, this.notePosition, startAngle, endAngle);
      pop();
    }
  }

  // 計算該 noteLand 對應的中心角度
  getNoteCenterAngle() {
    return this.noteLand * (TWO_PI / 32);
  }

  getNoteAngleDiff(){
     let noteAngleDeg = degrees(this.getNoteCenterAngle()); // 將音符的角度(弧度)轉為度數
      // 玩家角度已經在 angleCount_360L() 中轉為 0~360 度

      // 計算兩者之間的最小夾角差值 (0~180度)
      let angleDiff = Math.abs(angleCount_360L() - noteAngleDeg);
      return angleDiff;
  }

}