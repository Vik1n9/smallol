# 手機版（Android + iOS）可行性報告（2026-10-23）

對象：維護者裁決用。參考產品：LiveScore iOS（App Store id356928178）。
標記：**[事實]** 有實際輸出或官方原文；**[推論]** 由事實推出、未驗證；**[意見]** 我的判斷。

## 結論（先看這段）

1. **技術上可行，最大障礙不是技術，是條款。** **[事實]** Riot「Legal Jibber Jabber」第 3 條：不得有上架 Apple App Store 或 Google Play 的專案，「除非有 Riot 的書面授權，或有效的 Riot API key 並遵守 API 條款」。桌面版走 GitHub 發布，不碰這條；手機版只要上架就直接碰到。
2. **「像 LiveScore」要的東西，現在的資料服務沒有一半。** **[事實]** `state.json` 一次只有一局（單一 `game` 欄位），賽程的階段只認 Worlds（`Play-Ins`…`Finals`）。LiveScore 的核心是「多聯賽、多場同時、背景推播」，這三樣都要在服務端新建。
3. **手機上背景通知必須靠伺服器推播。** **[事實]** iOS App 在背景不能自己每 5 秒輪詢；現在的架構是「客戶端輪詢＋客戶端判斷事件」，手機要改成「服務端判斷事件＋APNs/FCM 推播」。
4. **前端程式可重用的比例高。** **[事實]** 資料模型、轉換、事件判斷、i18n、設定、地圖共 2,987 行，**0 個** Tauri import；178 個測試在 Linux 通過。桌面專屬的是 6 個檔（1,636 行）加 Rust 殼（462 行），手機版幾乎都要重寫或丟掉。
5. **[意見] 建議順序**：先問 Riot（不寫程式）→ 先做 PWA＋Web Push 驗證需求（不上架、成本最低）→ 有人用、條款也清楚了，再決定原生或 Capacitor 上架。**不建議直接用 Tauri mobile 上架。** 理由見第 5、6 節。

## 1. 倉庫現況（量測）

| 項目 | 結果 | 收據 |
| --- | --- | --- |
| 版本 | 0.1.1，Windows 正式、macOS 實驗（已公證） | `package.json`、commit `e2c347d` |
| 測試 | 15 檔通過、1 檔跳過；178 通過、2 跳過 | `npx vitest run`（2026-10-23） |
| 與平台無關的核心 | `src/model` `events` `data` `render` `settings` `i18n` 共 2,987 行，`@tauri-apps`/`invoke(` 0 命中 | `grep -rlE "@tauri-apps\|invoke\(" …` → 0 |
| 依賴 Tauri 的前端 | `ui/main.ts`(1049)、`panels/*`(283)、`notify/*`(258)、`ui/updates.ts`(46)，共 1,636 行 | `grep -rl "@tauri-apps" src \| xargs wc -l` |
| Rust 殼 `lib.rs`（462 行） | 全域熱鍵、Windows 勿擾狀態、滑鼠按鍵、視窗座標、設定檔讀寫、開串流網址 | 讀原始碼 |
| 渲染方式 | 視圖函式回傳 HTML 字串（`barView`、`mapView`、`playersView`…）、地圖回傳 SVG 字串 | `src/ui/views.ts`、`src/render/map-svg.ts` |
| 公開資料服務 | `state.json` 200，3,815 B，`access-control-allow-origin: *`，無 `ETag`/`Cache-Control`，`server: BaseHTTP/0.6 Python/3.12.3`（Caddy 反代） | `curl -D -` 單次請求，2026-10-23 20:23Z |

**[推論]** 桌面專屬的部分（無邊框置頂小條、多視窗、熱鍵、全螢幕自動低調、邊緣吸附、App 內更新）在手機上都沒有對應概念，**不是移植，是換掉**。可直接搬的是「資料 → 模型 → 事件」整條管線。

## 2. LiveScore 有什麼，對照 SmalLoL

**[事實]** LiveScore iOS 頁面（2026-10-23 讀取）：LiveScore Ltd.、運動類、4.8 分 5 萬則評分、221.3 MB、iOS 15+、13+ 分級（含廣告、模擬博弈）。功能：多聯賽即時比分、跨多場的即時通知（進球、紅牌）、最愛球隊/聯賽、球隊頁與球員數據、非官方文字/語音轉播、新聞。說明頁**沒有提到** Live Activities、小工具或 Apple Watch（沒提到不等於沒有）。隱私標籤列有「用於追蹤你的資料」（位置、瀏覽紀錄、識別碼等）。

| LiveScore 功能 | SmalLoL 現有 | 差距 |
| --- | --- | --- |
| 多場同時的即時比分列表 | 單一 `state.json`，一次一局 | **服務端要改成每場一份狀態**；CV 讀轉播畫面的成本隨同時進行的場數增加 **[推論]** |
| 多聯賽 | 賽程階段只認 Worlds | 要擴到 LCK/LPL/LEC/LTA 等；聯賽 id 來源已在探針中驗證（`getLeagues`） |
| 背景推播（最愛隊伍） | 客戶端「我的隊伍」、事件分級（卡片/小條） | **要新建推播後端** |
| 比賽詳情 | 地圖、BP、選手、事件紀錄、經濟差 | **這是 SmalLoL 的強項**，LiveScore 的足球詳情沒有這麼細 |
| 積分榜 | 無 | 新欄位 |
| 新聞 | 無 | **[意見]** 不做，違反「做得更少」 |
| 防爆雷 | 有（資料視窗的結果開關） | 可直接沿用 |
| 廣告、追蹤 | 無（README：無帳號、無分析） | **[意見]** 不要學，這是現有使用者在意的差異 |

**競品 [事實]**：Riot 官方的 Riot Mobile 已有電競賽程、直播、預設隱藏爆雷、通知設定。官方頁面**沒寫**是否推送比賽中的即時戰況（未確認）。**[推論]** SmalLoL 手機版能差異化的是「鎖定畫面瞄一眼就有經濟差、龍與巴龍倒數、塔」，而不是賽程或直播。

## 3. 平台限制（決定架構的事實）

| 限制 | 內容 | 影響 |
| --- | --- | --- |
| iOS 背景執行 | App 進背景後不能持續輪詢；背景更新由系統決定時機 | 現在的「每 5 秒輪詢」只在 App 開著時有效 |
| iOS Live Activity | 最多活動 8 小時，之後在鎖定畫面再留最多 4 小時（共 12 小時）**[事實，Apple ActivityKit 文件]**；推播更新有**未公開**的頻率預算，priority 10 會扣預算 **[事實，Apple DTS 論壇回覆]** | BO5 通常在 8 小時內 **[推論]**；不能每 5 秒更新，要挑關鍵時刻推（龍、巴龍、塔、團戰後經濟） |
| Live Activity 實作 | 要用 Swift 寫 Widget Extension，不能用網頁畫 | 不管選哪個框架，**這部分一定是原生 Swift** |
| Android 16 Live Updates | `ProgressStyle` 通知可升級為狀態列晶片的 promoted notification，需宣告 `POST_PROMOTED_NOTIFICATIONS` **[事實，二手來源，未讀 Android 官方文件]** | Android 15 以下退回一般常駐通知 |
| Android 背景 | 有 Doze 等限制；前景服務可常駐但類型與時限各版本不同 **[未查證細節]** | 建議也走 FCM 推播，不靠常駐服務 |

**推播後端的形狀 [推論]**：
- 服務端已經每 5 秒產生 `state.json`。把 `src/events/derive.ts`（純 TypeScript、無 DOM）搬到服務端 Node 跑，對每場比賽產生事件，再依事件分級送推播。
- 用 **FCM topic**（例如 `team-T1`、`match-<id>`）：裝置自己訂閱主題，**服務端不必存裝置 token**，可維持「無帳號」。FCM 也能轉送到 iOS（APNs）。
- Live Activity 的推播 token 是每個活動一個，**必須**由服務端保存與推送，這部分躲不掉。
- 延遲：官方 feed 相對轉播的延遲**仍未量測**（`PROBE_2026-10-14.md` 已列）。`state.json` 今天回報 `videoLagSec: 46.0`，語意未在本報告驗證。推播比轉播慢或快很多都會傷體驗，**動工前要量**。

## 4. 條款與上架（最大風險）

| 來源 | 原文重點 | 對手機版的意思 |
| --- | --- | --- |
| Riot Legal Jibber Jabber §3 **[事實]**（頁面標示 2018-08 更新） | 「We prohibit the use of our IP in games and apps」；App Store／Google Play 專案需有書面授權或有效 Riot API key 並遵守 API 條款 | **上架前一定要解決**。資料不是來自 Riot 官方 API，能否拿到 key 對應這個產品**不確定**，要直接問 Riot |
| 同上 §2 | 非商業；不可付費牆；廣告只允許「被動」收入 | 與現在「免費、無廣告」相容 |
| 同上 §6 | 規定的免責聲明文字 | README 現在用的是另一段 Riot 文字，上架時要照 §6 |
| Riot 開發者政策（Valorant 頁）**[事實，二手摘要]** | 面向玩家的產品「無論是否使用官方 API」都要註冊 | **[推論]** LoL 很可能同樣要求，未讀原文 |
| Apple 審核指南 5.2.2 **[摘要，非逐字]** | 顯示第三方服務的內容，要有該服務條款的許可，「被要求時須提供授權」 | 資料來自 lolesports 的非官方 key，**提不出授權** |
| Apple 審核指南 5.2.1 **[摘要，非逐字]** | 不得未經許可使用第三方商標、著作 | 英雄名、隊伍代碼的使用範圍要確認；README 已不用 logo |
| 資料源 | esports-api 的 `x-api-key` 非官方核發（探針文件） | **[推論]** 使用者量變大會更顯眼，服務被封的風險上升；這風險桌面版也有，手機版放大 |

**[推論]** 不上架（PWA、或 Android 直接發 APK）不觸發 §3 的「App Store／Google Play」那半句，但第一句「不得在 games and apps 使用我們的 IP」範圍較廣，桌面版其實也在同一句的灰色地帶。**我不能給法律判斷**，這要維護者自己決定，或問 Riot。

## 5. 技術方案比較

| 方案 | 前端重用 | 推播 | Live Activity / Live Updates | 上架 | 優點 | 缺點 | 適用情境 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **A. PWA＋Web Push** | 最高：Vite 與 HTML 字串視圖直接用；服務已給 `CORS *` | Web Push（iOS 要先「加入主畫面」，iOS 16.4+） | 無 | 不上架 | 成本最低；不觸發 §3 的上架條款；一套程式兩平台 | iOS 要使用者手動加到主畫面；沒有鎖定畫面即時卡片；通知樣式受限 | **驗證需求、條款未清楚之前** |
| **B. Capacitor** | 高：同一份 TS/HTML | 官方 `@capacitor/push-notifications` | 原生擴充另寫（Swift/Kotlin） | 可上架 | 生態成熟、外掛多；網頁層與 A 共用 | 要另學 Capacitor；Live Activity 仍是原生程式 | 決定上架、想保留單一網頁前端 |
| **C. Tauri 2 mobile** | 高（核心與視圖） | 只有第三方外掛（官方 `plugin-notification` 只有本機通知）**[事實]** | 原生擴充要手動加進產生的 Xcode 專案 **[推論，未實測]** | 可上架 | 跟桌面同一套工具、同一個 repo | 桌面殼幾乎全部用不到（多視窗、熱鍵、托盤）；推播與 Live Activity 都是非官方路線；`TAURI_LESSONS.md` 的經驗都是桌面的 | **[意見]** 只有「一定要同一套工具」時才選 |
| **D. 原生（SwiftUI＋Kotlin）** | 低：TS 核心不能直接用 | 原生 APNs/FCM | 一等公民 | 可上架 | 鎖定畫面、小工具、Watch 體驗最好 | 兩套程式；若事件判斷移到服務端，客戶端只剩顯示，重寫量下降 | 鎖定畫面體驗是賣點、有長期維護力 |

**[意見]** 若事件判斷搬到服務端（推播本來就需要），客戶端變薄，B 與 D 的差距縮小；這時「Live Activity 一定要原生」會讓 D 的吸引力上升。

## 6. 工作量粗估（未量測，僅供排序）

| 項目 | 規模 **[推論]** |
| --- | --- |
| 服務端：多場比賽狀態（每場一份 `state.json`）、多聯賽賽程 | 大；CV 讀轉播的部分隨場數放大，可能要先只做官方 feed 有的欄位 |
| 服務端：事件判斷移植（`derive.ts` 等）＋FCM 推播 | 中；邏輯已有測試可沿用 |
| 手機 UI：比分列表 → 比賽詳情（重用地圖、BP、選手、事件紀錄） | 中；現有視圖為 380×48 小條設計，要重新排版 |
| Live Activity（iOS）／Live Updates（Android） | 中，各一份原生程式 |
| 上架準備：隱私權政策、截圖、審核、Riot 授權 | 時間不可控（取決於 Riot 回覆） |
| 帳號費用 | Apple Developer Program 已有（macOS 已公證 **[推論]**）；Google Play 開發者帳號未知 |

## 7. 時機

**[推論]** 2026 Worlds 約 11 月初結束，手機版趕不上本屆。下一個高峰是 2027 年初各賽區開季（日期未查）。`APP_PLAYBOOK.md`：「產品的價值綁著賽季，宣傳時機只在賽季中」，而現在服務只支援 Worlds，開季前要先把多聯賽做出來。

## 8. 建議的下一步（等維護者裁決）

1. **問 Riot**（不寫程式）：在 Developer Portal 說明產品，問手機上架是否可取得 key／授權。這決定 B/C/D 是否可能。
2. **量延遲**：官方 feed 相對轉播的延遲、`videoLagSec` 的語意。推播類產品的核心價值就是快。
3. **決定範圍**：只做 Worlds/國際賽，還是多聯賽？多場同時是否只用官方 feed（放棄塔位置、BP 等 CV 欄位）？
4. **若要先試水溫**：做 A（PWA＋Web Push），沿用現有網站網域與視圖，量實際訂閱人數，再決定是否上架。

## 未驗證／未讀取

- Apple ActivityKit 推播更新的官方頁面內容（抓取時只拿到標題）；頻率預算的說法來自 Apple 論壇 DTS 回覆與第三方文件。
- Apple 審核指南 5.2.1、5.2.2、4.2 為摘要，非逐字原文。
- Riot LoL 專屬的開發者政策原文、Riot Mobile 是否推送比賽中戰況。
- Tauri mobile 第三方推播外掛的維護狀態；Android 前景服務時限。
- 服務端 Python BaseHTTP 能撐多少並發輪詢（未壓測）。

## 來源

- LiveScore App Store：https://apps.apple.com/app/id356928178
- Riot Legal Jibber Jabber：https://www.riotgames.com/en/legal
- Riot Mobile 功能：https://support.riotgames.com/riot/apps/riot-mobile-features
- Riot 開發者文件（Valorant 政策）：https://developer.riotgames.com/docs/valorant
- Apple 審核指南：https://developer.apple.com/app-store/review/guidelines/
- Apple Live Activities：https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities
- Apple 論壇（推播預算）：https://developer.apple.com/forums/thread/747624 、https://developer.apple.com/forums/thread/797728
- Android 16 Live Updates（二手）：https://proandroiddev.com/live-updates-in-android-16-exploring-the-next-evolution-of-notifications-1a5cf5de2068
- Tauri 推播外掛（第三方）：https://github.com/yanqianglu/tauri-plugin-mobile-push 、https://github.com/Choochmeque/tauri-plugin-notifications
