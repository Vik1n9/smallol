// The desktop shell: the bar, the notification window and the optional windows, a tray menu, and
// remembered positions.
// Everything about the game lives in the web view; this side only manages the window and the
// settings file. Trimmed from Basesmall's shell (no updater, hotkeys or style files yet).

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use std::path::PathBuf;
use tauri_plugin_window_state::StateFlags;

/// Command-line arguments, so `desktoplol --sample --tier=bar` can be checked by hand.
#[tauri::command]
fn launch_args() -> Vec<String> {
    std::env::args().skip(1).collect()
}

/// Where settings live: the app config dir, or `DESKTOPLOL_CONFIG_DIR` when set
/// (checking runs use a scratch folder so they never touch the user's own settings).
fn config_dir(app: &tauri::AppHandle) -> Option<(PathBuf, bool)> {
    if let Some(dir) = std::env::var_os("DESKTOPLOL_CONFIG_DIR").filter(|d| !d.is_empty()) {
        return Some((PathBuf::from(dir), true));
    }
    app.path().app_config_dir().ok().map(|d| (d, false))
}

/// The config folder in use, and whether it was overridden by `DESKTOPLOL_CONFIG_DIR`.
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
        use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER, SWP_SHOWWINDOW};
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        let flags = SWP_NOZORDER | SWP_NOACTIVATE | if show { SWP_SHOWWINDOW } else { 0 };
        let ok = unsafe { SetWindowPos(hwnd.0 as _, std::ptr::null_mut(), px, py, pw, ph, flags) };
        if ok == 0 {
            return Err("SetWindowPos failed".into());
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
    if let Some(dir) = std::env::var_os("DESKTOPLOL_CONFIG_DIR").filter(|d| !d.is_empty()) {
        window_state = window_state.with_filename(PathBuf::from(dir).join(".window-state.json").to_string_lossy());
    }
    tauri::Builder::default()
        .plugin(window_state.build())
        // Closing the bar quits, the other windows with it; otherwise a card or a panel would be left on screen.
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![launch_args, config_info, read_settings, write_settings, set_bounds])
        .setup(|app| {
            let toggle = MenuItem::with_id(app, "toggle", "Show / hide", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
            let click_through =
                CheckMenuItem::with_id(app, "click_through", "Click-through", true, false, None::<&str>)?;
            let on_top = CheckMenuItem::with_id(app, "on_top", "Always on top", true, true, None::<&str>)?;
            let bg_solid = MenuItem::with_id(app, "bg:solid", "Solid", true, None::<&str>)?;
            let bg_semi = MenuItem::with_id(app, "bg:semi", "Translucent", true, None::<&str>)?;
            let bg_clear = MenuItem::with_id(app, "bg:clear", "Clear", true, None::<&str>)?;
            let background = Submenu::with_items(app, "Background", true, &[&bg_solid, &bg_semi, &bg_clear])?;
            let quit = MenuItem::with_id(app, "quit", "Quit DesktopLOL", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(
                app,
                &[&toggle, &settings, &click_through, &on_top, &background, &separator, &quit],
            )?;

            let ct = click_through.clone();
            let ot = on_top.clone();
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().cloned().expect("bundled icon"))
                .tooltip("DesktopLOL")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(move |app, event| {
                    let Some(window) = app.get_webview_window("main") else { return };
                    match event.id().as_ref() {
                        "toggle" => {
                            if window.is_visible().unwrap_or(true) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                            }
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
        .expect("error while running DesktopLOL");
}
