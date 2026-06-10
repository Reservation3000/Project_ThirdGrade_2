#include <MPU9250_asukiaaa.h>
#include <WiFi.h>
#include <ArduinoWebsockets.h>
#include <ArduinoJson.h>

#ifdef _ESP32_HAL_I2C_H_               
#define SDA_PIN 21
#define SCL_PIN 22
#endif

const char* ssid = "RESERVATION"; 
const char* password = "0487878787";
const char* websocket_server = "ws://192.168.137.1:8080";
const int botton = 5; // 按鈕腳位
bool lastState = HIGH; // 上次按鈕狀態，初始為未按下 
int bottonStatus = 0;
bool bottonSent = false; // 追踪是否已發送過這次按下事件

using namespace websockets;
WebsocketsClient webClient;

MPU9250_asukiaaa mySensor;                                       // MPU9250 物件
float aX, aY, aZ, gX, gY, gZ, mX, mY, mZ;                        // 加速度、陀螺儀、磁力計原始數據
float gXoffset = 0, gYoffset = 0, gZoffset = 0;                  // 陀螺儀飄移偏移值

// ==================== Mahony 濾波器相關 ====================
float q[4] = {1.0f, 0.0f, 0.0f, 0.0f};  // 四元數 [w, x, y, z]
float eInt[3] = {0.0f, 0.0f, 0.0f};     // 積分誤差
float roll, pitch, yaw;                 // 歐拉角
float Kp = 4.0f;                        // 加速度比例增益：增加以提高響應速度
float Ki = 0.01f;                       // 加速度積分增益：增加以減少長期誤差
float Kp_z = 0.68f;                     // 磁場比例增益：降低以減少快速旋轉時的抖動 
float Ki_z = 0.008f;                    // 磁場積分增益：增加以改善磁場干擾的補償
float deltaT = 0;                       // 時間增量(deltaT)
unsigned long lastTime = 0;     

// ==================== 磁力計校正相關 ====================
float mXoffset = 0, mYoffset = 0, mZoffset = 0;        // 硬鐵偏移
float mXscale = 1.0f, mYscale = 1.0f, mZscale = 1.0f;  // 軟鐵比例

// ==================== 連線與校準狀態管理 ====================
int status = 0;                         // 0: 初始狀態, 1: 陀螺儀校準中, 2: 磁力計校準中, 3: 校準完成並開始傳送數據
int lastStatus = -1;                    // 
bool hasTriggered = false;              // 用來擋住重複輸出
int frequency = 29;                     // WebSocket 傳送頻率 (毫秒)
bool calibrationDone = false;           // 校準流程是否已完成
bool wifiConnected = false;             // WiFi 連線狀態
bool websocketConnected = false;        // WebSocket 連線狀態
unsigned long lastWiFiRetry = 0;        // 上次 WiFi 重試的時間
unsigned long lastWebSocketRetry = 0;   // 上次 WebSocket 重試的時間

// ==================== 函式宣告 ====================
void mahonyFilter(float ax, float ay, float az, float gx, float gy, float gz, float mx, float my, float mz);  
void quaternionToEuler(float &roll, float &pitch, float &yaw);  
void deltaTUpdate();  
void getMpuData();  
void websocketPublish();  
void connectStatus();  
void calibrateGyro();  
void calibrateMag();  

// 在標準的 C++ 中，編譯器是「由上往下」讀取程式碼的。如果在 setup() 裡呼叫了一個寫在檔案末尾的 calibrateMag()，
// 編譯器讀到那一行時會報錯，因為它還不知道有這個東西存在。
// 為了符合這個規則，通常需要寫 「函式原型 (Function Prototype)」


//=====================================
//==            setup()              ==
//=====================================
void setup() {
  Serial.begin(115200);
  while(!Serial);

  // ==================== 按鈕初始化 ====================
  pinMode(botton, INPUT_PULLUP); // 設定按鈕為輸

  // ==================== WiFi 初始化 ====================
  WiFi.onEvent(onWiFiEvent);  // 註冊 WiFi 事件處理函式
  WiFi.begin(ssid, password);
  Serial.println("WiFi connecting...");

  // ==================== WebSocket 初始化 ====================
  Serial.println("WebSocket Client initialized. Waiting for WiFi connection...");
  
  // ==================== MPU9250 初始化 ====================
#ifdef _ESP32_HAL_I2C_H_ 
  Wire.begin(SDA_PIN, SCL_PIN);
  mySensor.setWire(&Wire);
#endif

  mySensor.beginAccel();
  mySensor.beginGyro();
  mySensor.beginMag();
  
  delay(100);

  // ============= 初始化時間基準，用於計算 deltaT ============
  lastTime = millis();  

} 


//=====================================
//==             loop()              ==
//=====================================
void loop() {

  bool current = digitalRead(botton);
  // 偵測狀態改變
  if (current == LOW && lastState == HIGH) {
    bottonStatus = 1;
    bottonSent = false; // 按鈕按下，准备发送一次
    // Serial.println(1); 
    delay(20); // 必要的去彈跳
  } 

  else if (current == HIGH && lastState == LOW) {
    bottonStatus = 0;
    delay(20); // 去彈跳
  }

  lastState = current; // 更新狀態

  // 檢查 WiFi 和 WebSocket 連線 
  connectStatus();  

  // 執行校準流程（
  calibrationProcess();  

  // 計算時間增量(deltaT)
  deltaTUpdate() ;

  // 讀取 MPU9250 數據
  getMpuData();

  // 執行 Mahony 濾波器
  mahonyFilter(aX, aY, aZ, gX, gY, gZ, mX, mY, mZ);

  // 計算歐拉角
  quaternionToEuler(roll, pitch, yaw);

  // 發送數據到 WebSocket 服務器
  websocketPublish(); 

}

//==================== WiFi 事件處理函數 ====================
void onWiFiEvent(WiFiEvent_t event) {
  if (event == SYSTEM_EVENT_STA_GOT_IP) {
    Serial.println("[WiFi] Connected");
    wifiConnected = true;
  } else if (event == SYSTEM_EVENT_STA_DISCONNECTED) {
    Serial.println("[WiFi] Disconnected");
    wifiConnected = false;
    webClient.close();
  }
}

// ==================== 連線狀態管理函數 ====================
void connectStatus() {
  static bool lastWiFiState = false;
  bool currentWiFiState = (WiFi.status() == WL_CONNECTED);
  
  // WiFi 狀態變化：未連 -> 已連
  if (currentWiFiState && !lastWiFiState) {
    lastWiFiState = true;
    wifiConnected = true;
    status = 0;  // 觸發重新校準
    calibrationDone = false;
    Serial.print("[WiFi] Connected! IP: ");
    Serial.println(WiFi.localIP());
  }
  // WiFi 狀態變化：已連 -> 未連
  else if (!currentWiFiState && lastWiFiState) {
    lastWiFiState = false;
    wifiConnected = false;
    webClient.close();
    Serial.println("[WiFi] Disconnected");
  }
  
  // WiFi 未連接時，定時主動重連
  if (!wifiConnected) {
    if (millis() - lastWiFiRetry > 3000) {
      lastWiFiRetry = millis();
      Serial.println("[WiFi] Attempting to reconnect...");
      WiFi.begin(ssid, password);  // 主動重連
    }
    return;  // 未連接時停止執行後續邏輯
  }
  
  // WiFi 已連接，檢查 WebSocket
  if (webClient.available()) {
    webClient.poll();
  } else {
    if (millis() - lastWebSocketRetry > 5000) {
      lastWebSocketRetry = millis();
      if (webClient.connect(websocket_server)) {
        Serial.println("[WS] Connected");
      }
    }
  }
}

// ==================== 校準流程管理函數 ====================
void calibrationProcess(){
  if (!calibrationDone && status == 0) {   
    if (!wifiConnected) {                  
      delay(500);
      return;  
    }
    Serial.println("\n=== 開始校準 ===");
    calibrateGyro();
    delay(100);
    calibrateMag();
  }

  if (status != 3) {    // 只有校準完成才接續操作之後(loop中)的 code
    return;  
  }
}

// ==================== WebSocket 發佈函數 ====================
void websocketPublish() {
    // 只有在連線真的正常時才執行發送邏輯
    if (webClient.available()) {
        // 處理 0, 1, 2 的一次性發送
        if (status >= 0 && status <= 2 && status != lastStatus) {
            StaticJsonDocument<200> doc;
            doc["type"] = "status";
            switch (status) {
                case 0: doc["message"] = "A"; break;
                case 1: doc["message"] = "B"; break;
                case 2: doc["message"] = "C"; break;
            }
            String output;
            serializeJson(doc, output);
            webClient.send(output);
            lastStatus = status;
        }

        // 處理 status 3 的持續發送
        if (status == 3) {
            static unsigned long lastUpdate = 0;
            if (millis() - lastUpdate > frequency) {
                StaticJsonDocument<200> doc;
                doc["type"] = "sensor_data";
                doc["yaw"] = yaw;
                // 只在按鈕按下且還未發送時發送一次
                if (bottonStatus == 1 && !bottonSent) {
                    doc["bottonstatus"] = 1;
                    bottonSent = true; // 標記已發送
                } else {
                    doc["bottonstatus"] = 0;
                }
                String output;
                serializeJson(doc, output);
                webClient.send(output);
                lastUpdate = millis();
                lastStatus = 3; // 更新紀錄
            }
        }
        webClient.poll();
    }
}

// ==================== 計算時間增量 (deltaT) ====================
void deltaTUpdate() {
  unsigned long currentTime = micros();
  deltaT = (currentTime - lastTime) / 1000000.0f; // 轉換為秒
  if (deltaT > 0.1f) deltaT = 0.01f; // 限制最大值，避免過大
  if (deltaT < 0.000001f) deltaT = 0.001f; // 避免極小值
  lastTime = currentTime;
}

// ==================== 讀取 MPU9250 數據 ====================
void getMpuData(){
   // 讀取加速度
  int result = mySensor.accelUpdate();
  if (result == 0) {
    aX = mySensor.accelX();
    aY = mySensor.accelY();
    aZ = mySensor.accelZ();
  }

  // 讀取陀螺儀 (單位: deg/s，需要轉換為 rad/s)
  result = mySensor.gyroUpdate();
  if (result == 0) {
    gX = (mySensor.gyroX() - gXoffset / 0.0174533f) * 0.0174533f;  // 轉換為 rad/s 並減去飄移偏移
    gY = (mySensor.gyroY() - gYoffset / 0.0174533f) * 0.0174533f;
    gZ = (mySensor.gyroZ() - gZoffset / 0.0174533f) * 0.0174533f;
  }

  // 讀取磁力計
  result = mySensor.magUpdate();
  if (result == 0) {
    // 應用硬鐵校正和軟鐵比例
    mX = (mySensor.magX() - mXoffset) * mXscale;
    mY = (mySensor.magY() - mYoffset) * mYscale;
    mZ = (mySensor.magZ() - mZoffset) * mZscale;
  } else {
    mySensor.beginMag();
  }
}

// ==================== Mahony 濾波器 ====================
void mahonyFilter(float ax, float ay, float az, float gx, float gy, float gz, float mx, float my, float mz) {
  float norm;
  float hx, hy, bx, bz;
  float vx, vy, vz, wx, wy;
  float ex, ey, ez;
  float qa, qb, qc;

  float q1 = q[0], q2 = q[1], q3 = q[2], q4 = q[3];
  float q1q1 = q1 * q1;
  float q1q2 = q1 * q2;
  float q1q3 = q1 * q3;
  float q1q4 = q1 * q4;
  float q2q2 = q2 * q2;
  float q2q3 = q2 * q3;
  float q2q4 = q2 * q4;
  float q3q3 = q3 * q3;
  float q3q4 = q3 * q4;
  float q4q4 = q4 * q4;

  // 標準化加速度計
  norm = sqrt(ax * ax + ay * ay + az * az);
  if (norm == 0.0f) return;
  norm = 1.0f / norm;
  ax *= norm;
  ay *= norm;
  az *= norm;

  // 標準化磁力計
  norm = sqrt(mx * mx + my * my + mz * mz);
  if (norm == 0.0f) return;
  norm = 1.0f / norm;
  mx *= norm;
  my *= norm;
  mz *= norm;

  // 地球磁場參考方向
  hx = 2.0f * mx * (0.5f - q3q3 - q4q4) + 2.0f * my * (q2q3 - q1q4) + 2.0f * mz * (q2q4 + q1q3);
  hy = 2.0f * mx * (q2q3 + q1q4) + 2.0f * my * (0.5f - q2q2 - q4q4) + 2.0f * mz * (q3q4 - q1q2);
  bx = sqrt(hx * hx + hy * hy);
  bz = 2.0f * mx * (q2q4 - q1q3) + 2.0f * my * (q3q4 + q1q2) + 2.0f * mz * (0.5f - q2q2 - q3q3);

  // 估計的重力和磁場方向
  vx = 2.0f * (q2q4 - q1q3);
  vy = 2.0f * (q1q2 + q3q4);
  vz = q1q1 - q2q2 - q3q3 + q4q4;
  wx = 2.0f * bx * (0.5f - q3q3 - q4q4) + 2.0f * bz * (q2q4 - q1q3);
  wy = 2.0f * bx * (q2q3 - q1q4) + 2.0f * bz * (q1q2 + q3q4);

  // 誤差
  ex = (ay * vz - az * vy);
  ey = (az * vx - ax * vz);
  ez = (ax * vy - ay * vx) + (mx * wy - my * wx);

  // 積分誤差
  if (Ki > 0.0f) {
    eInt[0] += ex * deltaT;
    eInt[1] += ey * deltaT;
    eInt[2] += ez * deltaT;
  }

  // 角速度補償
  gx = gx + Kp * ex + Ki * eInt[0];
  gy = gy + Kp * ey + Ki * eInt[1];
  gz = gz + Kp_z * ez + Ki_z * eInt[2];

  // 整合四元數
  gx *= 0.5f * deltaT;
  gy *= 0.5f * deltaT;
  gz *= 0.5f * deltaT;
  qa = q[0];
  qb = q[1];
  qc = q[2];
  q[0] += (-qb * gx - qc * gy - q[3] * gz);
  q[1] += (qa * gx + qc * gz - q[3] * gy);
  q[2] += (qa * gy - qb * gz + q[3] * gx);
  q[3] += (qa * gz + qb * gy - qc * gx);

  // 標準化四元數
  norm = 1.0f / sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  q[0] *= norm;
  q[1] *= norm;
  q[2] *= norm;
  q[3] *= norm;
}

// ==================== 四元數轉歐拉角 ====================
void quaternionToEuler(float &roll, float &pitch, float &yaw) {
  float q0 = q[0];  // w
  float q1 = q[1];  // x
  float q2 = q[2];  // y
  float q3 = q[3];  // z

  // Roll (Phi)
  float sinr_cosp = 2 * (q0 * q1 + q2 * q3);
  float cosr_cosp = 1 - 2 * (q1 * q1 + q2 * q2);
  roll = atan2(sinr_cosp, cosr_cosp);

  // Pitch (Theta)
  float sinp = 2 * (q0 * q2 - q3 * q1);
  if (abs(sinp) >= 1)
    pitch = copysign(M_PI / 2, sinp);
  else
    pitch = asin(sinp);

  // Yaw (Psi)
  float siny_cosp = 2 * (q0 * q3 + q1 * q2);
  float cosy_cosp = 1 - 2 * (q2 * q2 + q3 * q3);
  yaw = atan2(siny_cosp, cosy_cosp);

  // 轉換為度數
  roll = roll * 180.0f / M_PI;
  pitch = pitch * 180.0f / M_PI;
  yaw = yaw * 180.0f / M_PI;
}

// ==================== 陀螺儀飄移校正 ====================
void calibrateGyro() {
  status = 1;
  // 發送陀螺儀校準訊息
  if (webClient.available()) {
    StaticJsonDocument<200> doc;
    doc["type"] = "status";
    doc["message"] = "Still mpu";
    String output;
    serializeJson(doc, output);
    webClient.send(output);
    Serial.println("已發佈: Still mpu");
  }
  
  Serial.println("校準陀螺儀中，請保持感測器靜止...");
  float sumX = 0, sumY = 0, sumZ = 0;
  int samples = 500;
  unsigned long lastPoll = millis();
  
  for(int i = 0; i < samples; i++) {
    // 定期 poll WebSocket，防止連線斷開
    if (millis() - lastPoll > 100) {
      if (webClient.available()) {
        webClient.poll();
      }
      lastPoll = millis();
    }
    
    if (mySensor.gyroUpdate() == 0) {
      sumX += mySensor.gyroX();
      sumY += mySensor.gyroY();
      sumZ += mySensor.gyroZ();
    }
    delay(2);
  }
  gXoffset = (sumX / samples) * 0.0174533f; // 轉為 rad/s
  gYoffset = (sumY / samples) * 0.0174533f;
  gZoffset = (sumZ / samples) * 0.0174533f;
  Serial.println("陀螺儀校準完成！");
}

// ==================== 磁力計硬鐵和軟鐵校正 ====================
void calibrateMag() {
  status = 2;
  // 發送磁力計校準訊息
  if (webClient.available()) {
    StaticJsonDocument<200> doc;
    doc["type"] = "status";
    doc["message"] = "Rotate mpu";
    String output;
    serializeJson(doc, output);
    webClient.send(output);
    Serial.println("已發佈: Rotate mpu");
  }
  
  Serial.println("\n磁力計校準開始...");
  Serial.println("請在 10 秒內旋轉感測器，使其朝向各個方向...");
  
  float minX = 0, maxX = 0;
  float minY = 0, maxY = 0;
  float minZ = 0, maxZ = 0;
  
  unsigned long startTime = millis();
  int calibrationTime = 10000;  // 10 秒校準時間
  unsigned long lastPoll = millis();
  
  while (millis() - startTime < calibrationTime) {
    // 定期 poll WebSocket，防止連線斷開
    if (millis() - lastPoll > 100) {
      if (webClient.available()) {
        webClient.poll();
      }
      lastPoll = millis();
    }
    
    if (mySensor.magUpdate() == 0) {
      float rawX = mySensor.magX();
      float rawY = mySensor.magY();
      float rawZ = mySensor.magZ();
      
      // 記錄最大最小值
      if (rawX < minX) minX = rawX;
      if (rawX > maxX) maxX = rawX;
      if (rawY < minY) minY = rawY;
      if (rawY > maxY) maxY = rawY;
      if (rawZ < minZ) minZ = rawZ;
      if (rawZ > maxZ) maxZ = rawZ;
    }
    delay(10);
  }
  
  // 計算硬鐵偏移 (最大值 + 最小值) / 2
  mXoffset = (maxX + minX) / 2.0f;
  mYoffset = (maxY + minY) / 2.0f;
  mZoffset = (maxZ + minZ) / 2.0f;
  
  // 計算軟鐵比例 - 使用最大範圍作為參考
  float rangeX = (maxX - minX) / 2.0f;
  float rangeY = (maxY - minY) / 2.0f;
  float rangeZ = (maxZ - minZ) / 2.0f;
  
  float maxRange = rangeX;
  if (rangeY > maxRange) maxRange = rangeY;
  if (rangeZ > maxRange) maxRange = rangeZ;
  
  mXscale = (rangeX > 0) ? (maxRange / rangeX) : 1.0f;
  mYscale = (rangeY > 0) ? (maxRange / rangeY) : 1.0f;
  mZscale = (rangeZ > 0) ? (maxRange / rangeZ) : 1.0f;
  
  // 輸出校準結果
  Serial.println("\n磁力計校準完成！");
  Serial.print("硬鐵偏移 - X: "); Serial.print(mXoffset, 2);
  Serial.print(", Y: "); Serial.print(mYoffset, 2);
  Serial.print(", Z: "); Serial.println(mZoffset, 2);
  Serial.print("軟鐵比例 - X: "); Serial.print(mXscale, 3);
  Serial.print(", Y: "); Serial.print(mYscale, 3);
  Serial.print(", Z: "); Serial.println(mZscale, 3);

  status = 3; // 校準完成，開始傳送數據
  calibrationDone = true;  // 標誌校準已完成
}
