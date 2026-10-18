// The desktop shell: the bar, the notification window and the optional windows, a tray menu, and
// remembered positions.
// Everything about the game lives in the web view; this side only manages the window and the
// settings file. Trimmed from Basesmall's shell (no updater or style files yet).

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use std::path::PathBuf;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::StateFlags;

/// The two global hotkeys (UI_SPEC batch 3 §1): three modifiers, so they take nothing from other
/// programs (Ctrl+Alt+L is IntelliJ's reformat), and different letters from Basesmall's (B, L).
fn hotkeys() -> [(&'static str, Shortcut); 2] {
    let m = Some(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SHIFT);
    [("hide", Shortcut::new(m, Code::KeyH)), ("lowkey", Shortcut::new(m, Code::KeyQ))]
}

/// Register or drop both hotkeys. Returns, for each, whether it is registered now; one another program
/// holds stays unregistered without stopping the other.
#[tauri::command]
async fn set_hotkeys(app: tauri::AppHandle, on: bool) -> Vec<(String, bool)> {
    let gs = app.global_shortcut();
    let state = hotkeys()
        .into_iter()
        .map(|(name, key)| {
            if on {
                if !gs.is_registered(key) {
                    let _ = gs.register(key);
                }
            } else if gs.is_registered(key) {
                let _ = gs.unregister(key);
            }
            (name.to_string(), gs.is_registered(key))
        })
        .collect::<Vec<_>>();
    // In the dev log: what checking runs read back (registered or held by another program).
    #[cfg(debug_assertions)]
    eprintln!("hotkeys on={on}: {state:?}");
    state
}

/// Whether Windows says notifications are welcome now (the same signal Windows uses for its own):
/// "busy" (a full-screen program), "d3d" (a full-screen game), "presentation", "quiet" (quiet hours),
/// "app" (a full-screen Store app), "away" (screen saver, locked) or "ok". Elsewhere always "ok".
#[tauri::command]
fn notify_state() -> &'static str {
    state_name(query_notify_state())
}

/// The raw QUERY_USER_NOTIFICATION_STATE (5, "accepts notifications", when it cannot be asked).
fn query_notify_state() -> i32 {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::Shell::SHQueryUserNotificationState;
        let mut state = 0;
        if unsafe { SHQueryUserNotificationState(&mut state) } != 0 {
            return 5;
        }
        state
    }
    #[cfg(not(windows))]
    {
        5
    }
}

/// Windows' numbers: 1 not present, 2 busy, 3 D3D full screen, 4 presentation, 5 accepts
/// notifications, 6 quiet time, 7 Store app. Anything else counts as accepting.
fn state_name(n: i32) -> &'static str {
    match n {
        1 => "away",
        2 => "busy",
        3 => "d3d",
        4 => "presentation",
        6 => "quiet",
        7 => "app",
        _ => "ok",
    }
}

/// Whether the left mouse button is down: a window paused mid-drag is not let go yet (batch 3 C1).
/// Reads the button's state only.
#[tauri::command]
fn left_button_down() -> bool {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
        (unsafe { GetAsyncKeyState(VK_LBUTTON as i32) } as u16 & 0x8000) != 0
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// Whether Alt is held: a window let go with Alt down does not snap to edges (batch 3 §5).
#[tauri::command]
fn alt_down() -> bool {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_MENU};
        (unsafe { GetAsyncKeyState(VK_MENU as i32) } as u16 & 0x8000) != 0
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// A stream address as the settings accept it: http or https, a host, no user name or password, at
/// most 2048 characters. The web view checks the same before saving; this checks again before opening.
fn watch_url_ok(text: &str) -> Option<tauri::Url> {
    if text.is_empty() || text.len() > 2048 {
        return None;
    }
    let url = tauri::Url::parse(text).ok()?;
    let fine = matches!(url.scheme(), "http" | "https") && url.host_str().is_some_and(|h| !h.is_empty()) && url.username().is_empty() && url.password().is_none();
    fine.then_some(url)
}

/// Open the stream address the user saved (batch 3 §4). Takes no address: nothing in a web view can
/// make it open anything else. With `--open-stub` it appends the address to `opened-urls.txt` instead.
#[tauri::command]
fn open_watch_url(app: tauri::AppHandle) -> Result<(), String> {
    let (dir, _) = config_dir(&app).ok_or("no config folder")?;
    let text = std::fs::read_to_string(dir.join("settings.json")).map_err(|e| e.to_string())?;
    let v: serde_json::Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|e| e.to_string())?;
    let url = watch_url_ok(v.get("watchUrl").and_then(|u| u.as_str()).unwrap_or("")).ok_or("no valid stream address saved")?;
    if std::env::args().any(|a| a == "--open-stub") {
        use std::io::Write;
        let mut f = std::fs::OpenOptions::new().create(true).append(true).open(dir.join("opened-urls.txt")).map_err(|e| e.to_string())?;
        return writeln!(f, "{url}").map_err(|e| e.to_string());
    }
    app.opener().open_url(url.as_str(), None::<&str>).map_err(|e| e.to_string())
}

/// Command-line arguments, so `smallol --sample --tier=bar` can be checked by hand.
#[tauri::command]
fn launch_args() -> Vec<String> {
    std::env::args().skip(1).collect()
}

/// Where settings live: the app config dir, or `SMALLOL_CONFIG_DIR` when set
/// (checking runs use a scratch folder so they never touch the user's own settings).
fn config_dir(app: &tauri::AppHandle) -> Option<(PathBuf, bool)> {
    if let Some(dir) = std::env::var_os("SMALLOL_CONFIG_DIR").filter(|d| !d.is_empty()) {
        return Some((PathBuf::from(dir), true));
    }
    app.path().app_config_dir().ok().map(|d| (d, false))
}

/// The config folder in use, and whether it was overridden by `SMALLOL_CONFIG_DIR`.
#[tauri::command]
fn config_info(app: tauri::AppHandle) -> (String, bool) {
    config_dir(&app).map(|(d, o)| (d.display().to_string(), o)).unwrap_or_default()
}

const SETTINGS_MAX_BYTES: u64 = 256 * 1024;

/// The saved settings file, or nothing before the first save. The web view validates it.
#[tauri::command]
fn read_settings(app: tauri::AppHandle) -> Option<String> {
    let (dir, _) = config_dir(&app)?;
    let path = dir.join("settings.json");
    if std::fs::metadata(&path).ok()?.len() > SETTINGS_MAX_BYTES {
        return None;
    }
    std::fs::read_to_string(path).ok()
}

/// Save settings atomically: write a temporary file, then rename it over the old one. A file the
/// user broke by hand (not valid JSON) is kept as settings.broken.json instead of being lost.
#[tauri::command]
fn write_settings(app: tauri::AppHandle, text: String) -> Result<(), String> {
    if text.len() as u64 > SETTINGS_MAX_BYTES || serde_json::from_str::<serde_json::Value>(&text).is_err() {
        return Err("settings must be JSON under 256 KB".into());
    }
    let (dir, _) = config_dir(&app).ok_or("no config folder")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("settings.json");
    if let Ok(old) = std::fs::read_to_string(&path) {
        // A byte-order mark (some Windows editors add one) is fine; the web view skips it too.
        if serde_json::from_str::<serde_json::Value>(old.trim_start_matches('\u{feff}')).is_err() {
            let _ = std::fs::write(dir.join("settings.broken.json"), old);
        }
    }
    let tmp = dir.join("settings.json.tmp");
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

const HISTORY_MAX_BYTES: u64 = 512 * 1024;

/// The log history (the last five games' events, UI_SPEC §5), or nothing before the first save.
#[tauri::command]
fn read_history(app: tauri::AppHandle) -> Option<String> {
    let (dir, _) = config_dir(&app)?;
    let path = dir.join("log-history.json");
    if std::fs::metadata(&path).ok()?.len() > HISTORY_MAX_BYTES {
        return None;
    }
    std::fs::read_to_string(path).ok()
}

/// Save the log history atomically, like the settings.
#[tauri::command]
fn write_history(app: tauri::AppHandle, text: String) -> Result<(), String> {
    if text.len() as u64 > HISTORY_MAX_BYTES || serde_json::from_str::<serde_json::Value>(&text).is_err() {
        return Err("history must be JSON under 512 KB".into());
    }
    let (dir, _) = config_dir(&app).ok_or("no config folder")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let tmp = dir.join("log-history.json.tmp");
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join("log-history.json")).map_err(|e| e.to_string())
}

/// Checking aid (`--anim-log=<file>`): append animation start/end/cancel records to that file in the
/// config folder, to time the animations without screen captures (throttling shows as late ends). The
/// name is a plain file name; anything else falls back to `anim-log.jsonl`.
#[tauri::command]
fn append_anim_log(app: tauri::AppHandle, text: String, file: Option<String>) -> Result<(), String> {
    use std::io::Write;
    if text.len() > 256 * 1024 {
        return Err("too long".into());
    }
    let name = file
        .filter(|f| !f.is_empty() && f.len() <= 64 && f.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c)) && !f.starts_with('.'))
        .unwrap_or_else(|| "anim-log.jsonl".into());
    let (dir, _) = config_dir(&app).ok_or("no config folder")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut f = std::fs::OpenOptions::new().create(true).append(true).open(dir.join(name)).map_err(|e| e.to_string())?;
    f.write_all(text.as_bytes()).map_err(|e| e.to_string())
}

/// Checking aid (`--devlog`): one line into the dev log (debug builds only), e.g. what a step sent.
#[tauri::command]
fn dev_log(text: String) {
    #[cfg(debug_assertions)]
    eprintln!("devlog: {}", text.chars().take(400).collect::<String>());
    #[cfg(not(debug_assertions))]
    let _ = text;
}

/// Move and resize a window in one step (logical pixels on the window's own screen), without
/// activating it; `show` also shows it. Two separate calls (size, then position) left one frame where
/// the notification stack or the bar jumped (interaction designer's batch 1 review, item A/H).
#[tauri::command]
fn set_bounds(app: tauri::AppHandle, label: String, x: f64, y: f64, w: f64, h: f64, show: bool) -> Result<(), String> {
    let window = app.get_webview_window(&label).ok_or("no such window")?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let (px, py, pw, ph) = ((x * scale).round() as i32, (y * scale).round() as i32, (w * scale).round() as i32, (h * scale).round() as i32);
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER};
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        let ok = unsafe { SetWindowPos(hwnd.0 as _, std::ptr::null_mut(), px, py, pw, ph, SWP_NOZORDER | SWP_NOACTIVATE) };
        if ok == 0 {
            return Err("SetWindowPos failed".into());
        }
        // Shown through Tauri, not SWP_SHOWWINDOW: a window shown behind Tauri's back left its web view
        // thinking it was hidden, so its timers and animations were throttled (strips stayed a minute).
        if show && !window.is_visible().unwrap_or(false) {
            window.show().map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        window.set_size(tauri::PhysicalSize::new(pw as u32, ph as u32)).map_err(|e| e.to_string())?;
        window.set_position(tauri::PhysicalPosition::new(px, py)).map_err(|e| e.to_string())?;
        if show {
            window.show().map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

pub fn run() {
    // Size is per view (game, settings) and handled by the web view.
    // The notification window is placed by the main window (bottom-right corner); the others remember where the user put them.
    let mut window_state = tauri_plugin_window_state::Builder::default().with_state_flags(StateFlags::POSITION).with_denylist(&["notify"]);
    // A checking run keeps its window position with its scratch settings, not the user's. The
    // plugin joins this onto the config dir, and an absolute path replaces it.
    if let Some(dir) = std::env::var_os("SMALLOL_CONFIG_DIR").filter(|d| !d.is_empty()) {
        window_state = window_state.with_filename(PathBuf::from(dir).join(".window-state.json").to_string_lossy());
    }
    let no_tray = std::env::args().any(|a| a == "--no-tray");
    tauri::Builder::default()
        .plugin(window_state.build())
        .plugin(tauri_plugin_opener::init())
        // A hotkey goes to the bar's page, which owns every window (hide all, low-key).
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if let Some((name, _)) = hotkeys().into_iter().find(|(_, k)| k == shortcut) {
                        let _ = app.emit_to("main", "hotkey", name);
                    }
                })
                .build(),
        )
        // Closing the bar quits, the other windows with it; otherwise a card or a panel would be left on screen.
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![launch_args, config_info, read_settings, write_settings, set_bounds, read_history, write_history, append_anim_log, set_hotkeys, notify_state, alt_down, open_watch_url, dev_log, left_button_down])
        .setup(move |app| {
            let toggle = MenuItem::with_id(app, "toggle", "Show / hide", true, None::<&str>)?;
            let lowkey = MenuItem::with_id(app, "lowkey", "Low-key", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
            let click_through =
                CheckMenuItem::with_id(app, "click_through", "Click-through", true, false, None::<&str>)?;
            let on_top = CheckMenuItem::with_id(app, "on_top", "Always on top", true, true, None::<&str>)?;
            let bg_solid = MenuItem::with_id(app, "bg:solid", "Solid", true, None::<&str>)?;
            let bg_semi = MenuItem::with_id(app, "bg:semi", "Translucent", true, None::<&str>)?;
            let bg_clear = MenuItem::with_id(app, "bg:clear", "Clear", true, None::<&str>)?;
            let background = Submenu::with_items(app, "Background", true, &[&bg_solid, &bg_semi, &bg_clear])?;
            let quit = MenuItem::with_id(app, "quit", "Quit SmalLoL", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(
                app,
                &[&toggle, &lowkey, &settings, &click_through, &on_top, &background, &separator, &quit],
            )?;

            let ct = click_through.clone();
            let ot = on_top.clone();
            // A checking run without the tray (`--no-tray`): the web view then refuses to hide everything
            // unless a hotkey can bring it back (batch 3 §1, the way back is a hard rule).
            if !no_tray {
                TrayIconBuilder::with_id("main")
                    .icon(app.default_window_icon().cloned().expect("bundled icon"))
                    .tooltip("SmalLoL")
                    .menu(&menu)
                    .show_menu_on_left_click(true)
                    .on_menu_event(move |app, event| {
                        let Some(window) = app.get_webview_window("main") else { return };
                        match event.id().as_ref() {
                            // Every window, not only the bar: the bar's page owns them (same as the hotkey).
                            "toggle" => {
                                let _ = window.emit("hotkey", "hide");
                            }
                            "lowkey" => {
                                let _ = window.emit("hotkey", "lowkey");
                            }
                            // Clicks pass through to whatever is underneath; only the tray can turn it off.
                            "click_through" => {
                                let _ = window.set_ignore_cursor_events(ct.is_checked().unwrap_or(false));
                            }
                            "on_top" => {
                                let _ = window.set_always_on_top(ot.is_checked().unwrap_or(true));
                            }
                            "settings" => {
                                let _ = window.show();
                                let _ = window.emit("open-settings", ());
                            }
                            id if id.starts_with("bg:") => {
                                let _ = window.emit("bg-mode", &id[3..]);
                            }
                            "quit" => app.exit(0),
                            _ => {}
                        }
                    })
                    .build(app)?;
            }

            // In the dev log: what Windows really answers on this machine (batch 3 C3).
            #[cfg(debug_assertions)]
            {
                let n = query_notify_state();
                eprintln!("notify state at start: {n} = {}", state_name(n));
            }

            // Shown once the web view has had a moment to draw, so it never flashes blank.
            if let Some(window) = app.get_webview_window("main") {
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(1));
                    let _ = window.show();
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running SmalLoL");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The numbers are Windows' own (shellapi.h); the names are what the web view expects.
    #[test]
    fn notify_states() {
        #[cfg(windows)]
        {
            use windows_sys::Win32::UI::Shell::*;
            assert_eq!(
                [QUNS_NOT_PRESENT, QUNS_BUSY, QUNS_RUNNING_D3D_FULL_SCREEN, QUNS_PRESENTATION_MODE, QUNS_ACCEPTS_NOTIFICATIONS, QUNS_QUIET_TIME, QUNS_APP],
                [1, 2, 3, 4, 5, 6, 7]
            );
        }
        let names: Vec<_> = (1..=7).map(state_name).collect();
        assert_eq!(names, ["away", "busy", "d3d", "presentation", "ok", "quiet", "app"]);
        assert_eq!(state_name(0), "ok");
    }

    #[test]
    fn watch_urls() {
        assert!(watch_url_ok("https://www.youtube.com/@lolesports/live").is_some());
        assert!(watch_url_ok("http://example.com/").is_some());
        for bad in ["", "ftp://example.com/", "javascript:alert(1)", "file:///C:/x", "https://u:p@example.com/"] {
            assert!(watch_url_ok(bad).is_none(), "{bad}");
        }
        assert!(watch_url_ok(&format!("https://example.com/{}", "a".repeat(2048))).is_none());
    }
}
