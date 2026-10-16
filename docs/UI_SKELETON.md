# UI 骨架（2026-10-16）

Tauri 2 + TypeScript，骨架從 Basesmall 複製後刪減（沒有更新、熱鍵、風格檔、選配小視窗）。
資料只來自 Stream CV 服務的 `state.json`（合約：`DesktopLOL-StreamCV/docs/SERVICE_CONTRACT.md` v0）。

## 執行

```
npm install
npm run tauri dev          # App 視窗，讀 http://127.0.0.1:8787/state.json
npm run dev                # 只開網頁，瀏覽器看 http://localhost:1430/
npm test                   # vitest
npm run typecheck
```

檢查用參數（App 用 `--x`，瀏覽器用 `?x=1`；都不會寫入設定）：

| 參數 | 作用 |
| --- | --- |
| `sample` | 不問服務，直接畫樣本（只有開發版有樣本）。樣本是 Stream CV 合約 v0.1 的真實輸出，含系列賽與 BP（MVK vs FUR 第 3 局） |
| `demo` | 搭配 `sample`：把已結束的樣本當成進行中，倒數會走 |
| `settings` | 開啟設定頁 |
| `set=path:value,...` | 例：`set=language:en,show.gold:false,background:semi` |

開發版連不到服務時，會自動改畫樣本並標「樣本資料」；正式建置不含樣本（`dist/` 搜尋 game id 0 筆）。`fixtures/dev/series_draft_mock.json` 是假資料，只給測試用（禁用與 BP 順序支援之後的版面），App 不讀。

截圖：`npm run dev` 開著時跑 `node scripts/screenshots.mjs`，輸出到 `docs/screenshots/`。

## 模組

| 位置 | 內容 |
| --- | --- |
| `src/data/streamcv/contract.ts` | 合約的原始型別（全部 optional） |
| `src/data/streamcv/adapter.ts` | 原始 JSON → `MatchState`；壞欄位逐項丟掉，不會整份失敗 |
| `src/data/streamcv/source.ts` | 輪詢：5 秒一次、一次一個請求、`no-cache`、失敗退避 5→10→20→40→60 秒（±20%） |
| `src/model/types.ts`、`clock.ts` | 標準化模型；兩次更新之間時鐘繼續走（最多 20 秒，服務停了就看得出來） |
| `src/render/map-svg.ts` | 2.5D 塔圖（照 Basesmall 棋子的畫法：地面壓扁、有側面與陰影）。立著的塔是隊色柱子，倒下的是灰色殘座；水晶、主堡塔的重生倒數直接標在建築上 |
| `src/render/dragons.ts` | 龍屬性的顏色；畫面上是一格色塊加一個字（水、化…），不用 Riot 美術 |
| `src/ui/views.ts` | 上方標籤（BO 幾、第幾局、系列賽比分；本局 BP／全場 BP 開關）、三種尺寸（點：視窗高 < 50；條；地圖：扣掉標籤後 ≥ 100）、下方兩個 BP 視圖（打開時視窗往下長，比賽區大小不變） |
| `src/data/champions.ts`、`items.ts`（與 `.json`） | 英雄與裝備的中英文名（只有文字，不用圖示；Data Dragon 16.20.1，`scripts/ddragon-names.mjs` 產生） |
| `src/settings/schema.ts` | 14 個顯示開關、3 個下方視圖開關（本局 BP、全場 BP、選手）＋語言、背景、經濟顯示方式、時鐘、資料來源網址 |
| `src/i18n/index.ts` | 繁中／英文，型別保證兩邊鍵相同 |

## 系列賽與 BP

由 Stream CV 服務提供（合約 v0.1「系列賽與 BP」，2026-10-16；提案見 `docs/CONTRACT_PROPOSAL.md`）。v0.1 的限制，畫面照實顯示：

- 選角依**位置**排（上、野、中、下、輔，每格前面標位置），不是選角順序：feed 只給位置。
- 禁用與「輪到誰」**尚未支援**，畫面寫「尚未支援」，不畫空格。
- 本局選角開局後才有；BP 進行中顯示「開局後才會有」。
- 服務沒在本局開始前看到系列賽時，勝場不知道，上方標籤顯示「MVK vs FUR」，滑鼠移上去看原因。
- 服務沒有系列賽資料時（例如沒有設定 API key），畫面寫「系列賽資料未接上」「還沒有 BP 資料」。

## 選手

位置、選手、英雄、等級、血量、K/D/A、補刀、金錢，加一行裝備名稱（可關；飾品、藥水不列）。BP 視圖不標位置，位置只在這裡（維護者 2026-10-16）。
服務還沒有這項，欄位見 `docs/CONTRACT_PROPOSAL.md` 的「選手」。開發時可用 `scripts/feed-players.mjs` 把真實 feed 的某一刻存到 `raw/`（不進 git）來排版；截圖裡的選手數據就是這樣來的（feed 01:27:09，比樣本的終局早，擊殺加總 18:8，不是 22:8）。

## 從資料推論的地方（要知道的）

- **哪一路的水晶倒了**：合約只有「哪一隊、何時重生」，沒有路線。只有在「倒的水晶數＝水晶塔倒的路數」時才在地圖上標出路線，倒數標在那座水晶上（多座時依時間配對，是推定）；路線不能確定時，倒數以文字膠囊（「紅方水晶 2:40」）列在右邊。
- **未辨識的塔**：feed 的塔數比 CV 命名的多時，地圖該隊角落顯示 `+N?`。
- **主堡塔重生**：照合約的 `respawnAt`，時間到就畫回來（沒有等 `nexusRespawnsSeen` 確認）。
- **沒有 `towersLost`**：塔畫成半透明，表示「不知道」，不是「都還在」。
- 倒數只在 `in_game` 時顯示；`finished` 只畫最終狀態。
- 龍的中文名（火龍、水龍、土龍、風龍、海克斯龍、化學龍）是一般叫法，未對照官方中文版。

## 驗證狀態

- 單元測試 58 項通過，含：樣本的「CV 命名的塔數＝對方 `towersDestroyedBy`＝tower 事件數」(10)；樣本三局 30 個英雄 ID 全部對得上名稱表、沒有重複（無懼選角）。
- 瀏覽器（localhost:1430）讀到實際服務的 `idle` 回應，畫出「目前沒有進行中的比賽」。
- 第一版用 Tauri debug 版實際開窗截過圖；2.5D 這一版只有瀏覽器截圖（`scripts/screenshots.mjs`），沒有另開 App 視窗截圖。
- **未驗證**：Tauri 正式建置（release、CSP 下對 127.0.0.1:8787 的請求）、進行中比賽的實際資料、延遲。
- 之後換 VPS 網址時，`src-tauri/tauri.conf.json` 的 CSP `connect-src` 要加上該網域，否則 App 內請求會被擋（瀏覽器開發模式不受影響）。
