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
| `sample` | 不問服務，直接畫樣本（只有開發版有樣本） |
| `demo` | 搭配 `sample`：把已結束的樣本當成進行中，倒數會走 |
| `settings` | 開啟設定頁 |
| `set=path:value,...` | 例：`set=language:en,show.gold:false,background:semi` |

開發版連不到服務時，會自動改畫樣本並標「樣本資料」；正式建置不含樣本（`dist/` 搜尋 game id 無結果）。

截圖：`npm run dev` 開著時跑 `node scripts/screenshots.mjs`，輸出到 `docs/screenshots/`。

## 模組

| 位置 | 內容 |
| --- | --- |
| `src/data/streamcv/contract.ts` | 合約的原始型別（全部 optional） |
| `src/data/streamcv/adapter.ts` | 原始 JSON → `MatchState`；壞欄位逐項丟掉，不會整份失敗 |
| `src/data/streamcv/source.ts` | 輪詢：5 秒一次、一次一個請求、`no-cache`、失敗退避 5→10→20→40→60 秒（±20%） |
| `src/model/types.ts`、`clock.ts` | 標準化模型；兩次更新之間時鐘繼續走（最多 20 秒，服務停了就看得出來） |
| `src/render/map-svg.ts` | 塔的示意圖（100×100，藍方左下、紅方右上，22 座塔＋6 個水晶＋主堡） |
| `src/render/dragons.ts` | 龍：每種屬性一個形狀＋顏色（不用 Riot 美術） |
| `src/ui/views.ts` | 三種尺寸：點（高 < 44）、條（< 120）、地圖（≥ 120），拉右下角切換 |
| `src/settings/schema.ts` | 12 個顯示開關＋語言、背景、經濟顯示方式、時鐘、資料來源網址 |
| `src/i18n/index.ts` | 繁中／英文，型別保證兩邊鍵相同 |

## 從資料推論的地方（要知道的）

- **哪一路的水晶倒了**：合約只有「哪一隊、何時重生」，沒有路線。只有在「倒的水晶數＝水晶塔倒的路數」時才在地圖上標出路線；倒數只列在右邊，不對應路線。
- **未辨識的塔**：feed 的塔數比 CV 命名的多時，地圖該隊角落顯示 `+N?`。
- **主堡塔重生**：照合約的 `respawnAt`，時間到就畫回來（沒有等 `nexusRespawnsSeen` 確認）。
- **沒有 `towersLost`**：塔畫成半透明，表示「不知道」，不是「都還在」。
- 倒數只在 `in_game` 時顯示；`finished` 只畫最終狀態。
- 龍的中文名（火龍、水龍、土龍、風龍、海克斯龍、化學龍）是一般叫法，未對照官方中文版。

## 驗證狀態

- 單元測試 36 項通過，含：樣本的「CV 命名的塔數＝對方 `towersDestroyedBy`＝tower 事件數」(10)。
- 瀏覽器（localhost:1430）讀到實際服務的 `idle` 回應，畫出「目前沒有進行中的比賽」。
- Tauri debug 版用 `--sample --demo` 實際開窗截圖（`docs/screenshots/tauri-window-live-zh.png`）。
- **未驗證**：Tauri 正式建置（release、CSP 下對 127.0.0.1:8787 的請求）、進行中比賽的實際資料、延遲。
- 之後換 VPS 網址時，`src-tauri/tauri.conf.json` 的 CSP `connect-src` 要加上該網域，否則 App 內請求會被擋（瀏覽器開發模式不受影響）。
