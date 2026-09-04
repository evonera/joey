// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_notification::NotificationExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DesktopConfig {
    api_url: String,
    api_token: String,
}

impl Default for DesktopConfig {
    fn default() -> Self {
        #[cfg(debug_assertions)]
        let default_url = "http://localhost:3000".to_string();
        #[cfg(not(debug_assertions))]
        let default_url = option_env!("JOEY_DESKTOP_URL")
            .unwrap_or("https://joey.evonera.com")
            .to_string();

        Self {
            api_url: default_url,
            api_token: String::new(),
        }
    }
}

struct AppState {
    config: Mutex<DesktopConfig>,
    pending_count: Mutex<usize>,
}

fn config_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("config.json"))
}

fn load_config(app: &tauri::AppHandle) -> DesktopConfig {
    if let Some(path) = config_path(app) {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(cfg) = serde_json::from_str::<DesktopConfig>(&data) {
                return cfg;
            }
        }
    }
    DesktopConfig::default()
}

fn save_config(
    app: &tauri::AppHandle,
    config: &DesktopConfig,
) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(path) = config_path(app) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let data = serde_json::to_string_pretty(config)?;
        std::fs::write(path, data)?;
    }
    Ok(())
}

fn toggle_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.center();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[derive(Deserialize)]
struct DraftsResponse {
    drafts: Option<Vec<serde_json::Value>>,
}

async fn sync_drafts(app: &tauri::AppHandle) -> usize {
    let state = app.state::<Arc<AppState>>();
    let (api_url, api_token) = {
        let cfg = state.config.lock().unwrap();
        (cfg.api_url.clone(), cfg.api_token.clone())
    };

    if api_token.trim().is_empty() {
        return 0;
    }

    let client = reqwest::Client::new();
    let url = format!(
        "{}/api/v1/drafts?status=pending_approval",
        api_url.trim_end_matches('/')
    );
    let resp = client
        .get(&url)
        .bearer_auth(&api_token)
        .header("Content-Type", "application/json")
        .send()
        .await;

    let mut count = 0;
    if let Ok(res) = resp {
        if res.status().is_success() {
            if let Ok(data) = res.json::<DraftsResponse>().await {
                count = data.drafts.map(|d| d.len()).unwrap_or(0);
            }
        }
    }

    let prev_count = {
        let mut pc = state.pending_count.lock().unwrap();
        let old = *pc;
        *pc = count;
        old
    };

    // Update tray if available
    if let Some(tray) = app.tray_by_id("main") {
        let title = format!("Joey ({})", count);
        let _ = tray.set_title(Some(title));
    }

    // Notify if new drafts are waiting
    if count > prev_count && prev_count > 0 || (count > 0 && prev_count == 0) {
        let _ = app
            .notification()
            .builder()
            .title("Joey: Drafts Ready for Review")
            .body(format!(
                "You have {} pending draft(s) waiting for review.",
                count
            ))
            .show();
    }

    let _ = app.emit(
        "desktop:draft-status",
        serde_json::json!({ "pendingCount": count }),
    );
    count
}

fn setup_main_window(app: &tauri::App) -> tauri::Result<()> {
    let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Joey Quick Capture")
        .inner_size(620.0, 270.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .center()
        .skip_taskbar(true)
        .visible(false)
        .shadow(true)
        .on_navigation(|url| {
            url.scheme() == "tauri"
                || url.host_str() == Some("localhost")
                || url.host_str() == Some("tauri.localhost")
                || url.scheme() == "joey"
        })
        .build()?;

    let w_clone = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Focused(false) = event {
            let _ = w_clone.hide();
        }
    });

    Ok(())
}

fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let header = MenuItem::with_id(
        app,
        "header",
        "Joey — 0 Pending Drafts",
        false,
        None::<&str>,
    )?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let review = MenuItem::with_id(app, "review", "Review Drafts (0)...", true, None::<&str>)?;
    let capture = MenuItem::with_id(
        app,
        "capture",
        "Quick Capture (Cmd+Shift+J)",
        true,
        None::<&str>,
    )?;
    let dashboard = MenuItem::with_id(app, "dashboard", "Open Web Dashboard", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let sync = MenuItem::with_id(app, "sync", "Sync Now", true, None::<&str>)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Joey", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &header, &sep1, &review, &capture, &dashboard, &sep2, &sync, &sep3, &quit,
        ],
    )?;

    TrayIconBuilder::with_id("main")
        .menu(&menu)
        .tooltip("Joey — AI Social Media Agent")
        .title("Joey (0)")
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "capture" => {
                toggle_window(app);
            }
            "review" => {
                let state = app.state::<Arc<AppState>>();
                let api_url = state.config.lock().unwrap().api_url.clone();
                let drafts_url = format!("{}/drafts", api_url.trim_end_matches('/'));
                let _ = open::that(&drafts_url);
            }
            "dashboard" => {
                let state = app.state::<Arc<AppState>>();
                let api_url = state.config.lock().unwrap().api_url.clone();
                let _ = open::that(&api_url);
            }
            "sync" => {
                let app_handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    sync_drafts(&app_handle).await;
                });
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
                toggle_window(app);
            }
        })
        .build(app)?;

    Ok(())
}

fn setup_event_handlers(app: &tauri::App) {
    let app_handle = app.handle().clone();

    // desktop:ready
    let h1 = app_handle.clone();
    app.listen("desktop:ready", move |_| {
        let state = h1.state::<Arc<AppState>>();
        let (api_url, api_token) = {
            let cfg = state.config.lock().unwrap();
            (cfg.api_url.clone(), cfg.api_token.clone())
        };
        let count = *state.pending_count.lock().unwrap();
        let _ = h1.emit(
            "desktop:settings",
            serde_json::json!({
                "apiUrl": api_url,
                "apiToken": api_token,
                "pendingCount": count,
            }),
        );
    });

    // desktop:hide-window
    let h2 = app_handle.clone();
    app.listen("desktop:hide-window", move |_| {
        if let Some(w) = h2.get_webview_window("main") {
            let _ = w.hide();
        }
    });

    // desktop:open-browser
    let h3 = app_handle.clone();
    app.listen("desktop:open-browser", move |event| {
        if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
            let path = payload.get("path").and_then(|v| v.as_str()).unwrap_or("/");
            let state = h3.state::<Arc<AppState>>();
            let api_url = state.config.lock().unwrap().api_url.clone();
            let full_url = format!("{}{}", api_url.trim_end_matches('/'), path);
            let _ = open::that(&full_url);
        }
    });

    // desktop:save-config
    let h4 = app_handle.clone();
    app.listen("desktop:save-config", move |event| {
        if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
            let api_url = payload
                .get("apiUrl")
                .and_then(|v| v.as_str())
                .unwrap_or("https://joey.evonera.com")
                .to_string();
            let api_token = payload
                .get("apiToken")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let new_config = DesktopConfig { api_url, api_token };
            let state = h4.state::<Arc<AppState>>();
            *state.config.lock().unwrap() = new_config.clone();
            let _ = save_config(&h4, &new_config);

            let _ = h4.emit(
                "desktop:save-result",
                serde_json::json!({ "success": true }),
            );

            let h_sync = h4.clone();
            tauri::async_runtime::spawn(async move {
                sync_drafts(&h_sync).await;
            });
        }
    });

    // desktop:test-connection
    let h5 = app_handle.clone();
    app.listen("desktop:test-connection", move |event| {
        if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
            let api_url = payload
                .get("apiUrl")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let api_token = payload
                .get("apiToken")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let h_reply = h5.clone();
            tauri::async_runtime::spawn(async move {
                let client = reqwest::Client::new();
                let url = format!("{}/api/v1/drafts?status=pending_approval", api_url.trim_end_matches('/'));
                match client.get(&url).bearer_auth(&api_token).send().await {
                    Ok(res) if res.status().is_success() => {
                        let count = res
                            .json::<DraftsResponse>()
                            .await
                            .ok()
                            .and_then(|d| d.drafts)
                            .map(|d| d.len())
                            .unwrap_or(0);
                        let _ = h_reply.emit(
                            "desktop:test-result",
                            serde_json::json!({ "success": true, "count": count }),
                        );
                    }
                    Ok(res) => {
                        let _ = h_reply.emit(
                            "desktop:test-result",
                            serde_json::json!({ "success": false, "error": format!("HTTP {}", res.status()) }),
                        );
                    }
                    Err(err) => {
                        let _ = h_reply.emit(
                            "desktop:test-result",
                            serde_json::json!({ "success": false, "error": err.to_string() }),
                        );
                    }
                }
            });
        }
    });

    // desktop:submit-draft
    let h6 = app_handle.clone();
    app.listen("desktop:submit-draft", move |event| {
        if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
            let content = payload
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let h_submit = h6.clone();
            tauri::async_runtime::spawn(async move {
                let state = h_submit.state::<Arc<AppState>>();
                let (api_url, api_token) = {
                    let cfg = state.config.lock().unwrap();
                    (cfg.api_url.clone(), cfg.api_token.clone())
                };

                if api_token.trim().is_empty() {
                    let _ = h_submit.emit(
                        "desktop:submit-result",
                        serde_json::json!({
                            "success": false,
                            "error": "No API token configured. Click the gear icon to set your Joey token."
                        }),
                    );
                    return;
                }

                let client = reqwest::Client::new();
                let url = format!("{}/api/v1/drafts", api_url.trim_end_matches('/'));
                let post_body = serde_json::json!({
                    "content": content
                });

                match client
                    .post(&url)
                    .bearer_auth(&api_token)
                    .json(&post_body)
                    .send()
                    .await
                {
                    Ok(res) if res.status().is_success() => {
                        let _ = h_submit.emit("desktop:submit-result", serde_json::json!({ "success": true }));
                        sync_drafts(&h_submit).await;
                    }
                    Ok(res) => {
                        let status = res.status();
                        let error_msg = res.text().await.unwrap_or_else(|_| format!("HTTP {}", status));
                        let _ = h_submit.emit(
                            "desktop:submit-result",
                            serde_json::json!({
                                "success": false,
                                "error": format!("API error ({}): {}", status, error_msg)
                            }),
                        );
                    }
                    Err(err) => {
                        let _ = h_submit.emit(
                            "desktop:submit-result",
                            serde_json::json!({
                                "success": false,
                                "error": format!("Network error: {}", err)
                            }),
                        );
                    }
                }
            });
        }
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let loaded_cfg = load_config(app.handle());
            let app_state = Arc::new(AppState {
                config: Mutex::new(loaded_cfg),
                pending_count: Mutex::new(0),
            });
            app.manage(app_state);

            setup_main_window(app)?;
            setup_tray(app)?;
            setup_event_handlers(app);

            // Register global shortcut: Cmd+Shift+J (Mac) / Ctrl+Shift+J (Win/Linux)
            if let Ok(shortcut) = "CommandOrControl+Shift+J".parse::<Shortcut>() {
                let _ = app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app_h, s, event| {
                            if s == &shortcut && event.state() == ShortcutState::Pressed {
                                toggle_window(app_h);
                            }
                        })
                        .build(),
                );
                let _ = app.global_shortcut().register(shortcut);
            }

            // Periodic poller for pending draft notifications
            let poller_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
                // Initial sync after 3 seconds
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                sync_drafts(&poller_handle).await;

                loop {
                    interval.tick().await;
                    sync_drafts(&poller_handle).await;
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
