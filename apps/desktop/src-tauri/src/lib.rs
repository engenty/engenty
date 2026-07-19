use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

/// Event the webview listens for to clear the stored server and re-run the
/// first-launch server picker (see apps/ui/src/desktop/desktop-runtime.ts).
const CHANGE_SERVER_EVENT: &str = "engenty-desktop:change-server";
/// Event the webview listens for to reload the SPA (⌘R works too).
const RELOAD_EVENT: &str = "engenty-desktop:reload";

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let open_item =
                MenuItem::with_id(app, "open", "Open engenty", true, None::<&str>)?;
            let reload_item =
                MenuItem::with_id(app, "reload", "Reload", true, None::<&str>)?;
            let change_server_item = MenuItem::with_id(
                app,
                "change-server",
                "Change Server…",
                true,
                None::<&str>,
            )?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item =
                MenuItem::with_id(app, "quit", "Quit engenty", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &open_item,
                    &reload_item,
                    &change_server_item,
                    &separator,
                    &quit_item,
                ],
            )?;
            TrayIconBuilder::with_id("engenty-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main_window(app),
                    "reload" => {
                        show_main_window(app);
                        let _ = app.emit(RELOAD_EVENT, ());
                    }
                    "change-server" => {
                        show_main_window(app);
                        let _ = app.emit(CHANGE_SERVER_EVENT, ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
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
