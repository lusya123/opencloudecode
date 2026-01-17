//! HTTP API 模块
//!
//! 为 CC Switch 提供独立的 HTTP API 服务，支持在不启动 Tauri GUI 的情况下运行。
//!
//! ## 架构设计
//!
//! ```text
//! api/
//! ├── mod.rs      - 模块入口
//! ├── types.rs    - API 请求/响应数据结构
//! ├── handlers.rs - API 请求处理函数
//! └── server.rs   - HTTP 服务器实现
//! ```

pub mod handlers;
pub mod server;
pub mod types;

pub use server::ApiServer;
