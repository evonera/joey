// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{tray::TrayIconBuilder, menu::{Menu, MenuItem}};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // System tray skeleton
            let menu = Menu::new(app)?;
            let tray = TrayIconBuilder::new()
                .menu(&menu)
                .on_tray_icon_event(|_app, _event| {
                    // Handle tray events here
                })
                .build(app)?;
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
