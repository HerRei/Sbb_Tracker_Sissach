/*
   Project: SBB Train Display
   Author: Hermès Reisner
   Date: 2024
   
   Notes:
   Using ESP32 and small screen.
   Added watchdog because it was freezing.
   Sorts departures by time now.
*/

#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>

// User configuration
const char* ssid     = "";
const char* password = "";
const char* STATION  = "Sissach"; // Any Swiss station or stop from the Transport API

// API transport filters: train, tram, ship, bus, cableway.
// Add more entries to combine modes, or set USE_TRANSPORTATION_FILTER to false to request all modes.
const bool USE_TRANSPORTATION_FILTER = true;
const char* TRANSPORTATION_TYPES[] = {"train"};
const size_t TRANSPORTATION_TYPE_COUNT = sizeof(TRANSPORTATION_TYPES) / sizeof(TRANSPORTATION_TYPES[0]);

// Optional display filters. Matches are prioritized first; set ONLY_SHOW_FILTER_MATCHES
// to true when the board should hide everything else.
const bool USE_DESTINATION_FILTERS = true;
const char* DESTINATION_FILTERS[] = {"basel", "laufen"};
const size_t DESTINATION_FILTER_COUNT = sizeof(DESTINATION_FILTERS) / sizeof(DESTINATION_FILTERS[0]);

const bool USE_LINE_FILTERS = true;
const char* LINE_FILTERS[] = {"S3", "IR27", "IR37"};
const size_t LINE_FILTER_COUNT = sizeof(LINE_FILTERS) / sizeof(LINE_FILTERS[0]);

const bool ONLY_SHOW_FILTER_MATCHES = false;

// watchdog time
const int timeout = 120; 

// Screen pins
#define TFT_MOSI 6
#define TFT_SCLK 7
#define TFT_CS   14
#define TFT_DC   15
#define TFT_RST  21
#define TFT_BL   22

// setup screen
Adafruit_ST7789 tft(TFT_CS, TFT_DC, TFT_MOSI, TFT_SCLK, TFT_RST);

// json buffers
StaticJsonDocument<9216> doc; 
StaticJsonDocument<512>  filter;

String payload; // string for data
const char* failMsg = "unknown";

// function to reset esp
void doReset(const char* txt) {
  failMsg = txt;

  Serial.println();
  Serial.println("XXX RESET XXX");
  Serial.print("Reason: ");
  Serial.println(txt);

  // show on screen
  tft.setTextColor(ST77XX_RED);
  tft.setCursor(0, 0);
  tft.print("RESET: ");
  tft.println(txt);

  delay(1500);
  ESP.restart();
}

// helper to check strings ignoring case
bool checkStr(const char* mainStr, const char* searchStr) {
  if (!mainStr || !searchStr || !*searchStr) return false;
  
  for (; *mainStr; mainStr++) {
    const char* h = mainStr;
    const char* n = searchStr;
    while (*h && *n) {
      char c1 = *h;
      char c2 = *n;
      // make uppercase
      if (c1 >= 'a' && c1 <= 'z') c1 -= 32;
      if (c2 >= 'a' && c2 <= 'z') c2 -= 32;
      if (c1 != c2) break;
      h++; n++;
    }
    if (!*n) return true; // found it
  }
  return false;
}

bool checkEqual(const char* a, const char* b) {
  if (!a || !b) return false;

  while (*a && *b) {
    char c1 = *a;
    char c2 = *b;
    if (c1 >= 'a' && c1 <= 'z') c1 -= 32;
    if (c2 >= 'a' && c2 <= 'z') c2 -= 32;
    if (c1 != c2) return false;
    a++;
    b++;
  }
  return *a == '\0' && *b == '\0';
}

bool matchesDestinationFilter(const char* dest) {
  if (!USE_DESTINATION_FILTERS) return false;

  for (size_t i = 0; i < DESTINATION_FILTER_COUNT; i++) {
    if (checkStr(dest, DESTINATION_FILTERS[i])) return true;
  }
  return false;
}

bool matchesLineFilter(const char* line) {
  if (!USE_LINE_FILTERS) return false;

  for (size_t i = 0; i < LINE_FILTER_COUNT; i++) {
    if (checkEqual(line, LINE_FILTERS[i])) return true;
  }
  return false;
}

// check if this departure matches the configured user filters
bool isTargetDeparture(const char* dest, const char* line) {
  if (!USE_DESTINATION_FILTERS && !USE_LINE_FILTERS) return true;
  return matchesDestinationFilter(dest) || matchesLineFilter(line);
}

String urlEncode(const char* value) {
  const char* hex = "0123456789ABCDEF";
  String encoded;

  for (const char* p = value; p && *p; p++) {
    uint8_t c = (uint8_t)*p;
    if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
        c == '-' || c == '_' || c == '.' || c == '~') {
      encoded += (char)c;
    } else {
      encoded += '%';
      encoded += hex[c >> 4];
      encoded += hex[c & 15];
    }
  }

  return encoded;
}

String buildApiUrl() {
  String url = "https://transport.opendata.ch/v1/stationboard?limit=8";

  if (USE_TRANSPORTATION_FILTER) {
    for (size_t i = 0; i < TRANSPORTATION_TYPE_COUNT; i++) {
      if (!TRANSPORTATION_TYPES[i] || !*TRANSPORTATION_TYPES[i]) continue;
      url += "&transportations%5B%5D=";
      url += urlEncode(TRANSPORTATION_TYPES[i]);
    }
  }

  url += "&station=";
  url += urlEncode(STATION);
  return url;
}

// draw one row on screen
void showRow(int i, const char* t, const char* l, int d) {
  int y = i * 43; // calculated y position
  tft.setTextSize(2);

  tft.setTextColor(ST77XX_WHITE);
  tft.setCursor(0, y + 12);
  tft.print(t);

  tft.setTextColor(ST77XX_CYAN);
  tft.setCursor(65, y + 12);
  tft.print(l);

  // draw delay box
  if (d > 1) {
    tft.fillRect(120, y + 4, 190, 36, ST77XX_RED);
    tft.setTextColor(ST77XX_WHITE);
    tft.setCursor(130, y + 12);
    tft.print('+'); 
    tft.print(d); 
    tft.print('\'');
  } else {
    tft.fillRect(120, y + 4, 190, 36, ST77XX_GREEN);
    if (d < 0) {
      tft.setTextColor(ST77XX_BLACK);
      tft.setCursor(130, y + 12);
      tft.print(d); 
      tft.print('\'');
    }
  }

  // line at bottom
  tft.drawLine(0, y + 42, 320, y + 42, 0x2104);
}

// draw empty row
void showEmpty(int i) {
  int y = i * 43;

  tft.fillRect(0, y, 320, 43, ST77XX_BLACK);
  tft.drawLine(0, y + 42, 320, y + 42, 0x2104);

  tft.setTextSize(2);
  tft.setTextColor(0x7BEF); // greyish
  tft.setCursor(0, y + 12);
  tft.print("--:--");
  tft.setCursor(65, y + 12);
  tft.print("----");

  tft.fillRect(120, y + 4, 190, 36, 0x4208);
}

// fix json string if needed
const char* fixJson(String& s) {
  int i = 0;
  // remove whitespace
  while (i < (int)s.length()) {
    char c = s[i];
    if (c != ' ' && c != '\t' && c != '\n' && c != '\r') break;
    i++;
  }
  if (i > 0) s.remove(0, i);

  // remove BOM
  if (s.length() >= 3 && (uint8_t)s[0] == 0xEF && (uint8_t)s[1] == 0xBB && (uint8_t)s[2] == 0xBF) {
    s.remove(0, 3);
  }

  if (s.length() == 0) return "empty_body";
  
  // check first char
  char fc = s[0];
  if (fc != '{' && fc != '[') return "not_json_body";
  
  return nullptr; // ok
}

// helper for char to int
int charToInt(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  return 0;
}

// convert time to number for sorting
uint32_t getSortKey(const char* iso) {
  if (!iso || strlen(iso) < 16) return 0;

  // parsing YYYY-MM-DDTHH:MM
  uint32_t y  = charToInt(iso[0]) * 1000 + charToInt(iso[1]) * 100 + charToInt(iso[2]) * 10 + charToInt(iso[3]);
  uint32_t mo = charToInt(iso[5]) * 10 + charToInt(iso[6]);
  uint32_t d  = charToInt(iso[8]) * 10 + charToInt(iso[9]);

  uint32_t h = charToInt(iso[11]) * 10 + charToInt(iso[12]);
  uint32_t m = charToInt(iso[14]) * 10 + charToInt(iso[15]);

  uint32_t fullDate = y * 10000 + mo * 100 + d;
  return fullDate * 1440U + (h * 60U + m);
}

// check if ID already exists
bool exists(const char ids[][20], int n, const char* id) {
  for (int i = 0; i < n; i++) {
    if (strcmp(ids[i], id) == 0) return true;
  }
  return false;
}

// Bubble sort
void doSort(uint32_t k[4], int d[4], char t[4][6], char l[4][10], char id[4][20], int n) {
  for (int i = 0; i < n - 1; i++) {
    for (int j = 0; j < n - 1 - i; j++) {
      if (k[j] > k[j + 1]) {
        // swap keys
        uint32_t tmpK = k[j]; k[j] = k[j + 1]; k[j + 1] = tmpK;
        // swap delay
        int tmpD = d[j]; d[j] = d[j + 1]; d[j + 1] = tmpD;

        // swap strings
        char tmpS[20];
        
        // time
        strcpy(tmpS, t[j]); strcpy(t[j], t[j + 1]); strcpy(t[j + 1], tmpS);
        // line
        strcpy(tmpS, l[j]); strcpy(l[j], l[j + 1]); strcpy(l[j + 1], tmpS);
        // id
        strcpy(tmpS, id[j]); strcpy(id[j], id[j + 1]); strcpy(id[j + 1], tmpS);
      }
    }
  }
}

bool getData() {
  esp_task_wdt_reset();
  delay(1);

  // check wifi
  if (WiFi.status() != WL_CONNECTED) {
    bool ok = false;
    for (int i = 0; i < 10; i++) {
      WiFi.reconnect();
      delay(500);
      esp_task_wdt_reset();
      delay(1);
      if (WiFi.status() == WL_CONNECTED) { 
        ok = true; 
        break; 
      }
    }
    if (!ok) { 
      failMsg = "wifi"; 
      return false; 
    }
  }

  WiFiClientSecure client;
  client.setInsecure(); // ignore ssl
  client.setTimeout(30000);

  HTTPClient http;
  http.setTimeout(30000);
  http.setReuse(false);
  http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
  http.addHeader("Accept-Encoding", "identity");

  String url = buildApiUrl();

  if (!http.begin(client, url)) {
    http.end();
    client.stop();
    failMsg = "begin";
    return false;
  }

  esp_task_wdt_reset();
  delay(1);

  int code = http.GET();

  esp_task_wdt_reset();
  delay(1);

  if (code != 200) {
    http.end();
    client.stop();
    failMsg = "http";
    return false;
  }

  // Handle brightness based on time
  String h = http.header("Date");
  int colon = h.indexOf(':');
  if (colon != -1) {
    int hr = h.substring(colon - 2, colon).toInt();
    if (hr >= 22 || hr <= 3) {
        analogWrite(TFT_BL, 10);
    } else {
        analogWrite(TFT_BL, 128);
    }
  } else {
    analogWrite(TFT_BL, 128);
  }

  int len = http.getSize();
  if (len > 0 && len < 70000) {
      payload.reserve((size_t)len + 256);
  }

  payload = http.getString();

  http.end();
  client.stop();

  esp_task_wdt_reset();
  delay(1);

  // check json
  const char* err = fixJson(payload);
  if (err) { 
    failMsg = err; 
    return false; 
  }

  doc.clear();
  DeserializationError jsonErr = deserializeJson(doc, payload, DeserializationOption::Filter(filter));
  
  if (jsonErr) {
    if (jsonErr == DeserializationError::InvalidInput) failMsg = "json_invalid";
    else if (jsonErr == DeserializationError::IncompleteInput) failMsg = "json_incomplete";
    else if (jsonErr == DeserializationError::NoMemory) failMsg = "json_nomemory";
    else failMsg = "json";
    return false;
  }

  JsonArray list = doc["stationboard"];

  // Temp arrays
  uint32_t tmpKey[8];
  int      tmpDelay[8];
  bool     tmpTarget[8];
  char     tmpTime[8][6];
  char     tmpLine[8][10];
  char     tmpId[8][20];
  int count = 0;

  for (JsonObject t : list) {
    if (count >= 8) break;

    const char* date = t["stop"]["departure"];
    if (!date || strlen(date) < 16) continue;

    const char* dst = t["to"];
    const char* cat  = t["category"];
    const char* num  = t["number"];

    char timeBuf[6];
    strncpy(timeBuf, date + 11, 5);
    timeBuf[5] = '\0';

    char lineBuf[10];
    size_t x = 0;
    
    // build line string
    if (cat) {
      size_t n = strlen(cat);
      size_t sp = (x < sizeof(lineBuf)) ? (sizeof(lineBuf) - x - 1) : 0;
      if (sp > 0) {
        size_t c = (n < sp) ? n : sp;
        memcpy(lineBuf + x, cat, c);
        x += c;
      }
    }
    if (num) {
      size_t n = strlen(num);
      size_t sp = (x < sizeof(lineBuf)) ? (sizeof(lineBuf) - x - 1) : 0;
      if (sp > 0) {
        size_t c = (n < sp) ? n : sp;
        memcpy(lineBuf + x, num, c);
        x += c;
      }
    }
    lineBuf[x] = '\0';

    char idBuf[20];
    snprintf(idBuf, sizeof(idBuf), "%s_%s", timeBuf, lineBuf);

    if (exists(tmpId, count, idBuf)) continue;

    int dVal = 0;
    if (!t["stop"]["delay"].isNull()) dVal = t["stop"]["delay"];
    if (dVal > 99) dVal = 99;

    tmpKey[count] = getSortKey(date);
    tmpDelay[count] = dVal;
    tmpTarget[count] = isTargetDeparture(dst, lineBuf);

    strncpy(tmpTime[count], timeBuf, 5);
    tmpTime[count][5] = '\0';
    
    strncpy(tmpLine[count], lineBuf, 9);
    tmpLine[count][9] = '\0';
    
    strncpy(tmpId[count], idBuf, 19);
    tmpId[count][19] = '\0';

    count++;
  }

  // Pick best 4
  uint32_t finalKey[4];
  int      finalDelay[4];
  char     finalTime[4][6];
  char     finalLine[4][10];
  char     finalId[4][20];
  int finalCount = 0;

  // 1. targets
  for (int i = 0; i < count && finalCount < 4; i++) {
    if (!tmpTarget[i]) continue;
    finalKey[finalCount] = tmpKey[i];
    finalDelay[finalCount] = tmpDelay[i];
    strcpy(finalTime[finalCount], tmpTime[i]);
    strcpy(finalLine[finalCount], tmpLine[i]);
    strcpy(finalId[finalCount], tmpId[i]);
    finalCount++;
  }
  
  // 2. others
  for (int i = 0; i < count && finalCount < 4; i++) {
    if (ONLY_SHOW_FILTER_MATCHES && !tmpTarget[i]) continue;
    if (exists(finalId, finalCount, tmpId[i])) continue;
    finalKey[finalCount] = tmpKey[i];
    finalDelay[finalCount] = tmpDelay[i];
    strcpy(finalTime[finalCount], tmpTime[i]);
    strcpy(finalLine[finalCount], tmpLine[i]);
    strcpy(finalId[finalCount], tmpId[i]);
    finalCount++;
  }

  // Sort them
  doSort(finalKey, finalDelay, finalTime, finalLine, finalId, finalCount);

  // Draw on screen
  tft.fillScreen(ST77XX_BLACK);

  for (int i = 0; i < finalCount; i++) {
    showRow(i, finalTime[i], finalLine[i], finalDelay[i]);
  }

  // Draw empty lines
  for (int r = finalCount; r < 4; r++) {
    showEmpty(r);
  }

  esp_task_wdt_reset();
  delay(1);
  return true;
}

void startWdt() {
// This part is copied for ESP32 core 3.x support
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  (void)esp_task_wdt_deinit();
  esp_task_wdt_config_t c;
  memset(&c, 0, sizeof(c));
  c.timeout_ms = (uint32_t)timeout * 1000U;
  c.idle_core_mask = (1U << 0) | (1U << 1);
  c.trigger_panic = true;
  esp_task_wdt_init(&c);
#else
  esp_task_wdt_init(timeout, true);
#endif
  esp_task_wdt_add(NULL);
  esp_task_wdt_reset();
  delay(1);
}

void setup() {
  Serial.begin(115200);

  startWdt();

  // JSON filter setup
  filter.clear();
  filter["stationboard"][0]["to"] = true;
  filter["stationboard"][0]["category"] = true;
  filter["stationboard"][0]["number"] = true;
  filter["stationboard"][0]["stop"]["departure"] = true;
  filter["stationboard"][0]["stop"]["delay"] = true;

  payload.reserve(12288);

  pinMode(TFT_BL, OUTPUT);
  analogWrite(TFT_BL, 128);

  // Init TFT
  tft.init(172, 320);
  tft.setRotation(3);
  tft.fillScreen(ST77XX_BLACK);
  tft.setTextWrap(false);

  tft.setTextSize(2);
  tft.setTextColor(ST77XX_YELLOW);
  tft.setCursor(10, 10);
  tft.println("Transit Board");
  tft.println("Connecting...");

  WiFi.begin(ssid, password);

  unsigned long t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < 30000) {
    delay(500);
    esp_task_wdt_reset();
    delay(1);
    tft.print('.');
  }

  tft.fillScreen(ST77XX_BLACK);
  if (WiFi.status() == WL_CONNECTED) {
    tft.setCursor(10, 10);
    tft.setTextColor(ST77XX_GREEN);
    tft.println("Connected!");
  } else {
    tft.setCursor(10, 10);
    tft.setTextColor(ST77XX_RED);
    tft.println("WiFi failed");
    delay(1500);
    ESP.restart();
  }

  delay(1000);
}

void loop() {
  esp_task_wdt_reset();
  delay(1);

  bool res = getData();

  esp_task_wdt_reset();
  delay(1);

  if (!res) {
    doReset(failMsg);
  }

  delay(60000); // wait 1 minute
}
