# SmalLoL

**League of Legends esports, but small.**

A quiet desktop bar for the pro match you can't watch.

SmalLoL is an unofficial desktop companion for following live League of Legends esports. A thin bar sits in a corner of your screen with the score, the clock, the gold lead and what is coming next (drake, herald, baron). When something happens, one line tells you, and the bigger moments show up as a small notice in the corner. Enough to know how the game is going at a glance, without the stream.

> **Status: early, not released yet.** Built and tested on Windows during the 2026 World Championship Play-Ins. There are no downloads yet; build it from source (below).

SmalLoL is the League of Legends sibling of [Basesmall](https://github.com/Zaious/basesmall).

## What it does

- **One bar, two lines.** The score, game clock, gold lead and the next two objective timers on top; the latest play underneath ("FUR secure Baron", "MVK SiuLoong solos Tatu"). Hover for the controls.
- **Notices in the corner** for the plays you care about: cards for the big moments (Baron, Soul, an inhibitor, a game won), small strips for the rest (towers, drakes, kills, level 6, first items). Tower streaks, level-6 waves and first items are merged into one updating strip instead of a pile.
- **Two presets and your own.** "At work" (you are not watching: tell me how it is going) and "Watching along" (the stream is on: only add what the broadcast does not say), or set each event yourself: off, log only, strip or card.
- **My team.** Star a team and its important events move up a step.
- **History.** Click the bar for every event of the last five games, by game time, filtered by importance or team.
- **Optional windows**, each placed where you want: the minimap with towers and drakes, this game's draft (picks and bans as they lock in, read from the broadcast), and the players with levels, items and K/D/A. They open by themselves when a match is on and get out of the way when it is not.
- **Data window:** the schedule, team pages (roster, this event's bans and picks) and player pages, with a spoiler-free switch for results.
- **Low-key mode.** A small grey strip of numbers that does not look like sports. It also turns on by itself while you present, play full screen or have Do not disturb on.
- **Hotkeys:** Ctrl+Alt+Shift+H hides every window, Ctrl+Alt+Shift+Q toggles low-key mode.
- **Optional card sound**, a link from a card to the stream you watch, edge snapping, English and Traditional Chinese.

## Where the data comes from

The app reads one JSON document (`state.json`, every five seconds) from a data service. The service, [smallol-cv](https://github.com/Zaious/smallol-cv), combines the official LoL Esports live feed (score, gold, kills, objectives, items) with what it reads from the broadcast picture (which tower fell, the draft, the herald). By default the app reads the public instance of that service; you can point it at your own in **Settings → Data source**.

## Build from source

You need Node.js 20+, Rust (stable) and, on Windows, the WebView2 runtime (Windows 11 has it).

```bash
npm install
npm run tauri dev      # run it
npm run tauri build    # make an installer
npm test               # unit tests
```

Checking aids for development (screenshots without clicking, replaying recorded games and so on) are listed at the top of `src/ui/main.ts`.

## Privacy

No account, no analytics. The app talks to the data service you set (the public one by default) and, only when you click **▶ Watch**, opens the stream address you saved in your browser. Settings and the event history stay in the app's config folder.

## Licence

Apache License 2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE). The name "SmalLoL" is not licensed for other works.

SmalLoL isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
