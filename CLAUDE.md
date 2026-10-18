# CLAUDE.md — SmalLoL

2026-10-13 由 DesktopMLB 的 session 預先建立。這裡還沒有程式碼，只有前一個專案留下的經驗。
**先讀完本檔與 `docs/` 三份，再動手。**

## 這是什麼

一個構想：仿照 Basesmall（MLB 的桌面角落小視窗），做英雄聯盟（職業賽事）的版本。
能不能做、要做成什麼樣子，取決於拿得到什麼資料，**目前一項都還沒驗證**。

## 參考專案：Basesmall

| 位置 | 內容 | 公開？ |
| --- | --- | --- |
| `P:\MyOpenSource\DesktopMLB\basesmall\` | Basesmall 原始碼（Tauri 2 + TypeScript），GitHub：Zaious/basesmall | 是 |
| `P:\MyOpenSource\DesktopMLB\` | 維護者的私人工作區：`PRD.md`、`deploy/`（網站 Worker）、`tools/`（簽章、更新金鑰、下載統計、winget）、`promo/`（宣傳稿） | 否 |

架構照抄 Basesmall 最省事，對照表：

| 要做的事 | 看 Basesmall 的哪裡 |
| --- | --- |
| 整體架構、模組、里程碑、驗收標準 | `basesmall/docs/ARCHITECTURE.md` |
| 資料源調查的寫法（端點、欄位、條款、結論） | `basesmall/docs/DATA_SOURCE.md`，尤其第 9 節「其他聯盟」 |
| 動工前先打 API 驗證 | `basesmall/docs/PROBE_REPORT.md`、`basesmall/scripts/probe/` |
| 標準化資料模型（渲染層只看這個） | `basesmall/src/model/types.ts` |
| 原始資料 → 一步一步的時間軸（重播不爆雷的基礎） | `basesmall/src/data/mlb/timeline.ts` |
| 直播輪詢：照伺服器要的間隔、只抓差異、退避 | `basesmall/src/data/mlb/live-source.ts`、`json-patch.ts` |
| 重播 | `basesmall/src/data/replay/` |
| 設定檔（每個欄位壞了各自退回預設） | `basesmall/src/settings/schema.ts` |
| 選配小視窗（主視窗是唯一資料擁有者） | `basesmall/src/panels/` |
| App 內更新（安裝版自己更新、免安裝版給連結） | `basesmall/src/ui/updates.ts`、`src-tauri/src/lib.rs` 的 `install_kind` |
| 雙語介面 | `basesmall/src/i18n/index.ts` |
| 拿官方數字驗收轉換層 | `basesmall/tests/timeline.test.ts` |
| 三平台建置、草稿發布、Mac 簽章公證、更新檔簽章 | `basesmall/.github/workflows/release.yml`、`tauri.release.conf.json`、`tauri.updater.conf.json` |
| 第三方授權清單 | `basesmall/scripts/third-party-licenses.mjs` |
| Mac 憑證、更新金鑰（維護者自己跑，不經手私鑰） | `DesktopMLB/tools/macos-signing.ps1`、`tools/updater-key.ps1` |
| 介紹網站與候補名單（Cloudflare Worker + D1） | `DesktopMLB/deploy/`、`basesmall/site/` |
| 下載統計 | `DesktopMLB/tools/downloads.mjs` |
| winget 上架 | `DesktopMLB/tools/winget/`（PR：microsoft/winget-pkgs#447388） |
| 網站版面檢查（右邊不能空） | `M:/ChronicleCore-Forge/infra/gates/pagebalance.mjs`，接在 `DesktopMLB/deploy/deploy.sh` |

## 動工順序

1. **資料探針**：照 `docs/LOL_DATA_OPEN_QUESTIONS.md`，對每個候選資料源少量實際請求，寫成跟 Basesmall `DATA_SOURCE.md` 第 9 節同格式的表（有哪些欄位、延遲、取得方式、條款、結論）。
2. 把探針結果給維護者看，由他決定做不做、做成什麼樣子。**不要在資料沒驗證前寫程式。**
3. 決定要做之後，再從 Basesmall 複製骨架（Tauri 設定、建置流程、設定檔、i18n），不要從頭重寫。

## 工作規則（從 Basesmall 帶過來的）

1. **先驗證再回報**：欄位名稱、端點行為、延遲一律以實際回應為準，不憑文件或記憶。
2. **渲染層不碰原始 JSON**：資料先轉成標準化模型。
3. **每個功能都做成開關**，預設值合理。
4. **做得更少，而不是更像**：目標是「瞄一眼就知道戰況」，不是做成另一個直播畫面。
5. **測試對官方數字**：拿錄好的比賽對照官方賽後數據。錄下來的原始資料不提交（授權）。
6. **資料用量要節制**：照伺服器要求的間隔輪詢，一次一個請求，失敗要退避。
7. **不使用遊戲公司或戰隊的 logo 與美術**，除非確認官方的同人創作政策允許（Riot 有這類政策，見 `docs/LOL_DATA_OPEN_QUESTIONS.md`）。

## 跟維護者合作（從 Basesmall 那個 session 學到的）

- 回覆用繁體中文（台灣）；程式碼、識別字、commit message 用英文。
- 量測優於估算，完成要附收據（實際指令與輸出）。量不到就說「未量測」。
- commit 與 push 分成兩個指令（push-guard 規定）。
- 改他寫的文字要**最小修改**，只改他同意的地方，不要順手潤飾或換說法。
- 宣傳評估要誠實、不要樂觀：沒有受眾的帳號在 X、LinkedIn 幾乎零曝光；Reddit 會擋新帳號；HN 新帳號會被限流，而且要求手寫文字。Basesmall 真正帶來流量的是 PTT 和 Threads（台灣）。
- 「誠實可能損害他的利益」時，先列選項讓他裁，不要自己用「誠實」定調。
