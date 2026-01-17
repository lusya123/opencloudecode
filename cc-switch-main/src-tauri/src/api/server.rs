//! HTTP 服务器实现

use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    routing::{delete, get, post, put},
    Router,
};
use tower_http::cors::{Any, CorsLayer};

use crate::api::handlers::{
    add_provider, delete_provider, get_current_provider, get_providers, health, switch_provider,
    update_provider, SharedState,
};
use crate::database::Database;
use crate::error::AppError;
use crate::store::AppState;

/// API 服务器配置
#[derive(Debug, Clone)]
pub struct ApiServerConfig {
    pub host: String,
    pub port: u16,
}

impl Default for ApiServerConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 8766,
        }
    }
}

/// API 服务器
pub struct ApiServer {
    config: ApiServerConfig,
    state: SharedState,
}

impl ApiServer {
    /// 创建新的 API 服务器实例
    pub fn new(config: ApiServerConfig, state: SharedState) -> Self {
        Self { config, state }
    }

    /// 使用默认配置创建 API 服务器
    pub fn with_defaults() -> Result<Self, AppError> {
        let db = Arc::new(Database::init()?);
        let state = Arc::new(AppState::new(db));

        Ok(Self {
            config: ApiServerConfig::default(),
            state,
        })
    }

    /// 使用指定端口创建 API 服务器
    pub fn with_port(port: u16) -> Result<Self, AppError> {
        let db = Arc::new(Database::init()?);
        let state = Arc::new(AppState::new(db));

        Ok(Self {
            config: ApiServerConfig {
                port,
                ..Default::default()
            },
            state,
        })
    }

    /// 构建路由
    fn build_router(&self) -> Router {
        // CORS 配置
        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);

        Router::new()
            // 健康检查
            .route("/health", get(health))
            // 提供商 API - 使用不同前缀避免路由冲突
            .route("/api/providers/app/:app", get(get_providers))
            .route("/api/providers/app/:app/current", get(get_current_provider))
            .route("/api/providers", post(add_provider))
            .route("/api/providers/item/:id", put(update_provider))
            .route("/api/providers/app/:app/:id", delete(delete_provider))
            .route("/api/providers/app/:app/:id/switch", post(switch_provider))
            .layer(cors)
            .with_state(self.state.clone())
    }

    /// 启动服务器
    pub async fn run(self) -> Result<(), AppError> {
        let addr: SocketAddr = format!("{}:{}", self.config.host, self.config.port)
            .parse()
            .map_err(|e| AppError::Message(format!("Invalid address: {e}")))?;

        let router = self.build_router();

        println!(
            "[CC Switch Server] Starting on http://{}:{}",
            self.config.host, self.config.port
        );

        let listener = tokio::net::TcpListener::bind(addr)
            .await
            .map_err(|e| AppError::Message(format!("Failed to bind address: {e}")))?;

        axum::serve(listener, router)
            .await
            .map_err(|e| AppError::Message(format!("Server error: {e}")))?;

        Ok(())
    }
}
