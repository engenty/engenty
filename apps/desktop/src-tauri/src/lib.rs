use serde::Deserialize;
use tauri::{
    menu::{
        CheckMenuItem, Menu, MenuItem, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
    },
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, Wry,
};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Event the webview listens for to clear the stored server and re-run the
/// first-launch server picker (see apps/ui/src/desktop/desktop-runtime.ts).
const CHANGE_SERVER_EVENT: &str = "engenty-desktop:change-server";
/// Event the webview listens for to reload the SPA (⌘R works too).
const RELOAD_EVENT: &str = "engenty-desktop:reload";
/// Client-side navigation request; payload is the SPA route path.
const NAVIGATE_EVENT: &str = "engenty-desktop:navigate";
/// Start a new chat / focus the composer (File → New Chat, global hotkey).
const NEW_CHAT_EVENT: &str = "engenty-desktop:new-chat";
/// Open the app settings (engenty → Settings…, ⌘,).
const SETTINGS_EVENT: &str = "engenty-desktop:settings";

/// System-wide hotkey that raises the window and starts a new chat (⌘N).
const QUICK_CAPTURE_SHORTCUT: &str = "alt+space";

/// Navigation entry reported by the SPA once its module catalog is known
/// (see apps/ui/src/desktop/DesktopBridge.tsx). The first nine get ⌘1–⌘9.
#[derive(Debug, Clone, Deserialize)]
struct NavMenuEntry {
    label: String,
    path: String,
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn handle_menu_event(app: &AppHandle, id: &str) {
    match id {
        "open" => show_main_window(app),
        "reload" => {
            show_main_window(app);
            let _ = app.emit(RELOAD_EVENT, ());
        }
        "change-server" => {
            show_main_window(app);
            let _ = app.emit(CHANGE_SERVER_EVENT, ());
        }
        "settings" => {
            show_main_window(app);
            let _ = app.emit(SETTINGS_EVENT, ());
        }
        "new-chat" => {
            show_main_window(app);
            let _ = app.emit(NEW_CHAT_EVENT, ());
        }
        "autostart" => {
            let autostart = app.autolaunch();
            let enabled = autostart.is_enabled().unwrap_or(false);
            let result = if enabled {
                autostart.disable()
            } else {
                autostart.enable()
            };
            if let Err(error) = result {
                eprintln!("[desktop] failed to toggle autostart: {error}");
            }
            sync_autostart_checkmark(app);
        }
        "quit" => app.exit(0),
        id => {
            if let Some(path) = id.strip_prefix("nav:") {
                show_main_window(app);
                let _ = app.emit(NAVIGATE_EVENT, path.to_string());
            }
        }
    }
}

/// Tray state kept so the autostart checkmark can be re-synced after toggles.
struct TrayMenuState {
    autostart_item: CheckMenuItem<Wry>,
}

fn sync_autostart_checkmark(app: &AppHandle) {
    if let Some(state) = app.try_state::<TrayMenuState>() {
        let enabled = app.autolaunch().is_enabled().unwrap_or(false);
        let _ = state.autostart_item.set_checked(enabled);
    }
}

/// Builds (or rebuilds) the native menu bar. `nav` comes from the SPA once the
/// module catalog is loaded; before that the Go menu is simply absent.
fn install_app_menu(app: &AppHandle, nav: &[NavMenuEntry]) -> tauri::Result<()> {
    let app_menu = SubmenuBuilder::new(app, "engenty")
        .about(None)
        .separator()
        .item(
            &MenuItemBuilder::with_id("settings", "Settings…")
                .accelerator("Cmd+,")
                .build(app)?,
        )
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(
            &MenuItemBuilder::with_id("new-chat", "New Chat")
                .accelerator("Cmd+N")
                .build(app)?,
        )
        .separator()
        .close_window()
        .build()?;
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(
            &MenuItemBuilder::with_id("reload", "Reload")
                .accelerator("Cmd+R")
                .build(app)?,
        )
        .item(&MenuItemBuilder::with_id("change-server", "Change Server…").build(app)?)
        .separator()
        .fullscreen()
        .build()?;
    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .build()?;

    let mut items: Vec<&dyn tauri::menu::IsMenuItem<Wry>> =
        vec![&app_menu, &file_menu, &edit_menu, &view_menu];
    let go_menu;
    if !nav.is_empty() {
        let mut go = SubmenuBuilder::new(app, "Go");
        for (index, entry) in nav.iter().enumerate() {
            let mut item =
                MenuItemBuilder::with_id(format!("nav:{}", entry.path), entry.label.as_str());
            if index < 9 {
                item = item.accelerator(format!("Cmd+{}", index + 1));
            }
            go = go.item(&item.build(app)?);
        }
        go_menu = go.build()?;
        items.push(&go_menu);
    }
    items.push(&window_menu);

    let menu = Menu::with_items(app, &items)?;
    app.set_menu(menu)?;
    Ok(())
}

/// Called by the SPA (DesktopBridge) with the user's actual navigation items
/// so the Go menu mirrors the in-app module bar, ⌘1–⌘9 included.
#[tauri::command]
fn set_navigation_menu(app: AppHandle, items: Vec<NavMenuEntry>) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Err(error) = install_app_menu(&handle, &items) {
            eprintln!("[desktop] failed to install app menu: {error}");
        }
    });
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        show_main_window(app);
                        let _ = app.emit(NEW_CHAT_EVENT, ());
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![set_navigation_menu])
        .setup(|app| {
            install_app_menu(app.handle(), &[])?;

            // Non-fatal: another app may own the hotkey.
            match QUICK_CAPTURE_SHORTCUT.parse::<Shortcut>() {
                Ok(shortcut) => {
                    if let Err(error) = app.global_shortcut().register(shortcut) {
                        eprintln!("[desktop] failed to register ⌥Space hotkey: {error}");
                    }
                }
                Err(error) => eprintln!("[desktop] invalid hotkey: {error}"),
            }

            let open_item = MenuItem::with_id(app, "open", "Open engenty", true, None::<&str>)?;
            let reload_item = MenuItem::with_id(app, "reload", "Reload", true, None::<&str>)?;
            let change_server_item = MenuItem::with_id(
                app,
                "change-server",
                "Change Server…",
                true,
                None::<&str>,
            )?;
            let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
            let autostart_item = CheckMenuItem::with_id(
                app,
                "autostart",
                "Start at Login",
                true,
                autostart_enabled,
                None::<&str>,
            )?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit engenty", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &open_item,
                    &reload_item,
                    &change_server_item,
                    &autostart_item,
                    &separator,
                    &quit_item,
                ],
            )?;
            app.manage(TrayMenuState {
                autostart_item: autostart_item.clone(),
            });
            TrayIconBuilder::with_id("engenty-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| handle_menu_event(app, event.id.as_ref()))
                .build(app)?;
            Ok(())
        })
        .on_menu_event(|app, event| handle_menu_event(app, event.id().as_ref()))
        .on_window_event(|window, event| {
            // Closing the window keeps the app alive in the Dock / menu bar,
            // matching macOS conventions. Quit via ⌘Q or the tray menu.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building the engenty desktop app")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                show_main_window(app);
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}
