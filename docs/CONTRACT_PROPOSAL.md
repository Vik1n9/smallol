# 給 Stream CV 服務的欄位：系列賽與 BP（2026-10-16 裁定由服務提供）

桌面工具的上方標籤（BO 幾、第幾局）和兩個下方視圖（本局 BP、全場 BP）需要以下欄位。
**合約 v0 沒有這些欄位**，所以目前畫面上顯示「系列賽資料未接上」「還沒有 BP 資料」。
桌面工具已經能讀下面這種形狀（`src/data/streamcv/adapter.ts`），欄位缺少或格式不對時會逐項丟掉，不會讓整個畫面失敗。

**維護者 2026-10-16 裁定：系列賽和 BP 由 Stream CV 服務抓，照本文件加進 `state.json`，桌面工具只讀服務。** 欄位名稱以服務實作後的合約（`SERVICE_CONTRACT.md`）為準；若與本文件不同，桌面工具的 adapter 跟著改。

**已實作（StreamCV a34f808，合約 v0.1「系列賽與 BP」）。與本提案不同之處，桌面工具已跟著改：** `picks` 依位置排（`draft.picksOrder: "role"`）；禁用與輪到誰尚未支援（`draft.bansSupported` / `turnSupported` 為 false）；`series` 多了 `matchId`，勝場不知道時 `wins` 為 null 並附 `series.winsNote`。下面是原始提案，保留作紀錄。

## 欄位

```json
"series": {
  "bestOf": 5,
  "game": 3,
  "teams": { "B": { "code": "T1", "wins": 1 }, "R": { "code": "GEN", "wins": 1 } }
},
"draft": {
  "current": {
    "game": 3,
    "B": { "team": "T1",  "bans": ["Azir", null, null, null, null], "picks": [null, null, null, null, null] },
    "R": { "team": "GEN", "bans": ["Rell", null, null, null, null], "picks": [null, null, null, null, null] },
    "turn": { "side": "B", "kind": "ban", "slot": 1 }
  },
  "earlier": [
    { "game": 1, "B": { "team": "T1", "bans": [], "picks": ["KSante", "Vi", "Azir", "Kalista", "Rell"] }, "R": { "team": "GEN", "bans": [], "picks": [] } }
  ]
}
```

| 欄位 | 說明 |
| --- | --- |
| `series.teams.B/R` | 這一局誰在藍方、誰在紅方（系列賽中會換邊），`wins` 是這局開始前的勝場 |
| `draft.*.bans` / `picks` | 各 5 格，依 BP 順序；還沒定的格子是 `null` |
| 英雄 | Data Dragon 的 id（`KSante`、`XinZhao`），桌面工具自己換成中英文名稱 |
| `draft.current.turn` | BP 進行中時，下一手是誰、禁或選、第幾格（0 起算）；BP 結束後為 `null` |
| `draft.earlier` | 同一系列賽前面幾局（無懼選角：這些局的 pick 雙方都不能再選） |
| `status` | BP 進行中時建議用 `waiting`，桌面工具就能在開局前顯示 BP |

## 各欄位可能的來源（未驗證，給維護者裁決）

| 資料 | 可能來源 | 已知的事 |
| --- | --- | --- |
| BO 幾、第幾局、勝場、隊伍代碼 | esports-api `getEventDetails` / `getSchedule` | 需要 `x-api-key`（非官方核發，見 `PROBE_2026-10-14.md`） |
| 本局 pick | feed `window` 的 `gameMetadata`（`championId`） | 不需 key；開局後才有 |
| 本局 ban、BP 進行中的順序 | 只有轉播畫面（CV） | feed 與 `details` 搜尋 `ban` 0 命中（2025 局）；StreamCV 有 `coach_bans.py` 實驗 |
| 前面局的 pick | 各局 feed 的 `gameMetadata` | 需要先知道各局的 game id（esports-api） |

由服務端（之後的 VPS）統一取這些資料，桌面工具只讀 `state.json` 一個來源，key 不必放進發給使用者的 App 裡。上表的來源都還沒有驗證，由服務那邊實際打過再定。

---

# 選手（提案，2026-10-16；維護者裁定由服務提供）

**已實作（StreamCV e74ea27，合約 v0.2「選手」），欄位名稱照本提案。** 另外加了 `players.asOf`（數據對應的 feed 幀時間）；`items` 在 details 取不到時為 `null`（畫面寫「裝備資料暫缺」）；`waiting` 時沒有 `players`。服務量過：8 局 participantId 皆藍 1–5、紅 6–10；window 與 details 每秒約 5 幀、時間戳一致。下面是原始提案。

桌面工具的「選手」視圖（位置、選手、英雄、等級、血量、K/D/A、補刀、金錢、裝備名稱）要的欄位。
**合約 v0.1 沒有這一項**，畫面目前寫「還沒有選手資料」。桌面工具已經能讀下面的形狀（`readPlayers`），缺少或格式不對的值逐項丟掉。

```json
"players": {
  "B": [
    { "role": "top", "name": "MVK Kratos", "champion": "Zaahen", "level": 16, "kills": 2, "deaths": 1, "assists": 5,
      "cs": 230, "gold": 11252, "hp": 3293, "maxHp": 3293, "items": [3078, 3363, 3111, 6631, 2019, 3155, 2055] }
  ],
  "R": [ ]
}
```

| 欄位 | feed 的來源（2026-10-16 實際打過 115660588583171785） | 說明 |
| --- | --- | --- |
| `role` | `window` 的 `gameMetadata.*.participantMetadata[].role` | feed 的值是 `top` `jungle` `mid` `bottom` `support`，照原樣送即可 |
| `name` | 同上 `summonerName` | feed 寫成「MVK Kratos」；照原樣送，桌面工具會去掉前面的隊伍代碼 |
| `champion` | 同上 `championId` | Data Dragon id |
| `level` `kills` `deaths` `assists` | `window` 每一幀的 `participants[]` | |
| `cs` | 同上 `creepScore` | |
| `gold` | 同上 `totalGold` | |
| `hp` / `maxHp` | 同上 `currentHealth` / `maxHealth` | 畫成血量條；陣亡時是 0 |
| `items` | `details` 每一幀的 `participants[].items` | Data Dragon 裝備 id（數字）。這場 40 個 id 全部對得上 16.20.1。飾品、藥水照送，桌面工具自己濾掉 |

- B/R 各 5 人，順序不拘，桌面工具會照上野中下輔排。
- 對照用參與者編號：`participantId` 1–5 是藍方、6–10 是紅方（這場的 `gameMetadata` 是這樣，未在其他局驗證）。
- 延遲、`details` 的更新間隔都**未量測**。

