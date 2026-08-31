// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindowBuilder,
};

fn desktop_origin() -> tauri::Url {
    #[cfg(debug_assertions)]
    let configured = "http://localhost:3000";
    #[cfg(not(debug_assertions))]
    let configured = option_env!("JOEY_DESKTOP_URL").unwrap_or("https://joey.evonera.com");
    let url = configured
        .parse::<tauri::Url>()
        .expect("JOEY_DESKTOP_URL must be a valid URL");
    #[cfg(not(debug_assertions))]
    assert_eq!(
        url.scheme(),
        "https",
        "release desktop origin must use HTTPS"
    );
    url
}

fn setup_main_window(app: &tauri::App) -> tauri::Result<()> {
    let origin = desktop_origin();
    let allowed_origin = origin.origin().ascii_serialization();
    WebviewWindowBuilder::new(app, "main", WebviewUrl::External(origin))
        .title("Joey — Autonomous Social Media Agent")
        .inner_size(1280.0, 800.0)
        .resizable(true)
        .on_navigation(move |url| {
            let candidate = url.origin().ascii_serialization();
            candidate == allowed_origin || url.scheme() == "joey"
        })
        .build()?;
    Ok(())
}

fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let open = MenuItem::with_id(app, "open", "Open Joey", true, None::<&str>)?;
    let pending = MenuItem::with_id(app, "pending", "Pending Drafts (0)", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Joey", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &sep, &pending, &sep2, &quit])?;

    TrayIconBuilder::new()
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "open" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            setup_main_window(app)?;
            setup_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
