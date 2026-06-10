class Rotate extends Inote {  
    constructor(triggerTime, direction) {
        super();
        this.triggerTime = triggerTime;
        this.direction = direction;
        this.noteSpeed = CONFIG.uslNoteSetting.speed;
        this.notePosition = CONFIG.uslNoteSetting.initialPosition;
        this.noteStrokeWeight = CONFIG.rotate.noteStrokeWeight;
        this.isActive = false;

        this.isJudged = false;
        this.judgeStyle = 0;  
    }

    update(time) {

    // 計算到達 judgeLine 所需的時間（毫秒）
    const requiredMs = (CONFIG.uslNoteSetting.initialPosition - CONFIG.uslNoteSetting.judgeLine) / this.noteSpeed * (1000 / CONFIG.display.frameRate);
    
    // 計算從音符應該開始移動的時間點到現在，經過了多少毫秒
    const elapsedMs = time - (this.triggerTime - requiredMs);

    if (elapsedMs < 0) {
      // 還沒到啟動時間
      this.isActive = false;
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

      if (!this.isJudged) {

        let rotateInput = getRotateJdgeAngle(time);

        if (this.notePosition <= CONFIG.uslNoteSetting.lifeLine) {
          this.judgeStyle = 3;
        }

      
        // prefect判定區間 
        else if (Math.abs(time - this.triggerTime) <= CONFIG.rotate.prefectRange)
        {
          // 角度回傳為正 + 音符方向為正
          if (rotateInput === 1 && this.direction === 1) {
            this.judgeStyle = 1;
          }
          // 角度回傳為負 + 音符方向為負
          else if (rotateInput === 2 && this.direction === 0) {
            this.judgeStyle = 1;
          } 
        }

        // great判定區間 
        else if (time - this.triggerTime >= CONFIG.rotate.greatRange ) 
        {
          // 角度回傳為正 + 音符方向為正
          if (rotateInput === 1 && this.direction === 1) {
            this.judgeStyle = 2;
          }
          // 角度回傳為負 + 音符方向為負
          else if (rotateInput === 2 && this.direction === 0) {
            this.judgeStyle = 2;
          }
        }

      // 確保 judgeStyle 有值才進行判定
      if (this.judgeStyle !== 0 && !this.isJudged) {
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
      
  }

  display(time) {
    if(this.isActive && !this.isJudged && this.notePosition >= 0) {

      push();
      if(this.direction === 1) {
        drawingContext.shadowBlur = 20; 
        drawingContext.shadowColor = `rgba(255, 100, 100, 1.9)`;
        stroke(...CONFIG.rotate.strokeColorClockwise);
      } else if(this.direction === 0) {
        drawingContext.shadowBlur = 20; 
        drawingContext.shadowColor = `rgba(100, 123, 255, 1.0)`;
        stroke(...CONFIG.rotate.strokeColorCounterClockwise);
      }
      
      strokeWeight(this.noteStrokeWeight);
      circle(width / 2, height / 2, this.notePosition); // 在判定線外圍繪製一個圓表示旋轉
      pop();
  }

  }


}



// 改用陣列記錄過去一小段時間的角度，避免多個 Rotate 音符彼此干擾 timeNow
let angleHistory = [];

function getRotateJdgeAngle(time) {
  const now = millis();
  // 將當下時間與總角度存入歷史紀錄
  angleHistory.push({ time: now, angle: angleCount_360() });

  // 移除超過 100 毫秒以前的紀錄 (以 100ms 內的轉動量來判定)
  while (angleHistory.length > 0 && now - angleHistory[0].time > CONFIG.rotate.judgeInterval) {
    angleHistory.shift();
  }

  if (angleHistory.length > 0) {
    let oldest = angleHistory[0];
    let latest = angleHistory[angleHistory.length - 1];
    let diff = latest.angle - oldest.angle;

    // 若 ms 內角度變化(diff) >= 需要的角度，視為持續順時針轉
    if (diff >= CONFIG.rotate.judgeNeedAngle) {
      return 1;
    } 
    // 若 100ms 內角度變化(diff) <= 負的需要的角度，視為持續逆時針轉
    else if (diff <= -CONFIG.rotate.judgeNeedAngle) {
      return 2;
    }
  }

  return 0;
}