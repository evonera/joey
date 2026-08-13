// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    menu::{Menu, MenuItem, PredefinedMenuItem},
    Manager, Emitter,
};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_store::StoreExt;
use serde_json::json;

#[tauri::command]
async fn save_auth_token(app: tauri::AppHandle, token: String) -> Result<(), String> {
    let store = app.store("auth.json").map_err(|e| e.to_string())?;
    store.set("api_token", json!(token));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_auth_token(app: tauri::AppHandle) -> Result<String, String> {
    let store = app.store("auth.json").map_err(|e| e.to_string())?;
    let token = store.get("api_token")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .ok_or_else(|| "Token not found".to_string())?;
    Ok(token)
}

#[tauri::command]
async fn clear_auth_token(app: tauri::AppHandle) -> Result<(), String> {
    let store = app.store("auth.json").map_err(|e| e.to_string())?;
    store.delete("api_token");
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn has_auth_token(app: tauri::AppHandle) -> Result<bool, String> {
    let store = app.store("auth.json").map_err(|e| e.to_string())?;
    Ok(store.has("api_token"))
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn update_pending_count(_app: tauri::AppHandle, _count: u32) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
async fn send_notification(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
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
        .on_menu_event(move |app, event| {
            match event.id.as_ref() {
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
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
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
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            setup_tray(app)?;

            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let urls = event.urls();
                for url in urls {
                    let _ = app_handle.emit("deep-link", url.to_string());
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            save_auth_token,
            get_auth_token,
            clear_auth_token,
            has_auth_token,
            update_pending_count,
            send_notification
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
