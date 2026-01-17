//! CC Switch HTTP API Server
//!
//! 独立的 HTTP 服务器，提供 CC Switch 的 REST API，
//! 可在不启动 Tauri GUI 的情况下运行。
//!
//! ## 使用方法
//!
//! ```bash
//! # 使用默认端口 (8766)
//! cc-switch-server
//!
//! # 指定端口
//! cc-switch-server --port 9000
//! ```

use clap::Parser;
use std::path::PathBuf;
use cc_switch_lib::api::ApiServer;
use cc_switch_lib::app_store;

/// CC Switch HTTP API Server
#[derive(Parser, Debug)]
#[command(name = "cc-switch-server")]
#[command(author, version, about = "CC Switch HTTP API Server", long_about = None)]
struct Args {
    /// 服务器监听端口
    #[arg(short, long, default_value_t = 8766)]
    port: u16,

    /// 覆盖应用配置目录（默认 ~/.cc-switch），用于隔离不同版本/不同用途的数据库与配置
    #[arg(long)]
    config_dir: Option<String>,
}

#[tokio::main]
async fn main() {
    let args = Args::parse();

    if let Some(dir) = args.config_dir.as_deref() {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            let path = PathBuf::from(trimmed);
            if let Err(e) = std::fs::create_dir_all(&path) {
                eprintln!("[CC Switch Server] Failed to create config dir {}: {}", path.display(), e);
                std::process::exit(1);
            }
            app_store::set_app_config_dir_override_for_process(Some(path));
        }
    }

    println!("[CC Switch Server] Version: {}", env!("CARGO_PKG_VERSION"));
    println!("[CC Switch Server] Initializing database...");

    let server = match ApiServer::with_port(args.port) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[CC Switch Server] Failed to initialize: {}", e);
            std::process::exit(1);
        }
    };

    println!("[CC Switch Server] Database initialized successfully");

    // 设置 Ctrl+C 信号处理
    tokio::spawn(async {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
        println!("\n[CC Switch Server] Shutting down...");
        std::process::exit(0);
    });

    if let Err(e) = server.run().await {
        eprintln!("[CC Switch Server] Server error: {}", e);
        std::process::exit(1);
    }
}
