//! API 请求处理函数

use std::str::FromStr;
use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};

use crate::api::types::{ApiResponse, HealthResponse, ProviderRequest, ProvidersResponse};
use crate::app_config::AppType;
use crate::provider::Provider;
use crate::services::ProviderService;
use crate::store::AppState;

/// 应用共享状态
pub type SharedState = Arc<AppState>;

/// 健康检查
pub async fn health() -> impl IntoResponse {
    Json(ApiResponse::success(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }))
}

/// 获取提供商列表
///
/// GET /api/providers?app=claude
pub async fn get_providers(
    State(state): State<SharedState>,
    Path(app): Path<String>,
) -> impl IntoResponse {
    let app_type = match AppType::from_str(&app) {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<ProvidersResponse>::error(e.to_string())),
            )
        }
    };

    match ProviderService::list(&state, app_type.clone()) {
        Ok(providers) => {
            let current = ProviderService::current(&state, app_type).ok();
            (
                StatusCode::OK,
                Json(ApiResponse::success(ProvidersResponse { providers, current })),
            )
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(e.to_string())),
        ),
    }
}

/// 获取当前提供商
///
/// GET /api/providers/:app/current
pub async fn get_current_provider(
    State(state): State<SharedState>,
    Path(app): Path<String>,
) -> impl IntoResponse {
    let app_type = match AppType::from_str(&app) {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<String>::error(e.to_string())),
            )
        }
    };

    match ProviderService::current(&state, app_type) {
        Ok(current) => (StatusCode::OK, Json(ApiResponse::success(current))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(e.to_string())),
        ),
    }
}

/// 添加提供商
///
/// POST /api/providers
pub async fn add_provider(
    State(state): State<SharedState>,
    Json(req): Json<ProviderRequest>,
) -> impl IntoResponse {
    let app_type = match AppType::from_str(&req.app) {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<bool>::error(e.to_string())),
            )
        }
    };

    match ProviderService::add(&state, app_type, req.provider) {
        Ok(result) => (StatusCode::OK, Json(ApiResponse::success(result))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(e.to_string())),
        ),
    }
}

/// 更新提供商
///
/// PUT /api/providers/:id
pub async fn update_provider(
    State(state): State<SharedState>,
    Path(id): Path<String>,
    Json(req): Json<ProviderRequest>,
) -> impl IntoResponse {
    let app_type = match AppType::from_str(&req.app) {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<bool>::error(e.to_string())),
            )
        }
    };

    // 确保 ID 一致
    let mut provider = req.provider;
    provider.id = id;

    match ProviderService::update(&state, app_type, provider) {
        Ok(result) => (StatusCode::OK, Json(ApiResponse::success(result))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(e.to_string())),
        ),
    }
}

/// 删除提供商
///
/// DELETE /api/providers/:app/:id
pub async fn delete_provider(
    State(state): State<SharedState>,
    Path((app, id)): Path<(String, String)>,
) -> impl IntoResponse {
    let app_type = match AppType::from_str(&app) {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<bool>::error(e.to_string())),
            )
        }
    };

    match ProviderService::delete(&state, app_type, &id) {
        Ok(()) => (StatusCode::OK, Json(ApiResponse::success(true))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(e.to_string())),
        ),
    }
}

/// 切换提供商
///
/// POST /api/providers/:app/:id/switch
pub async fn switch_provider(
    State(state): State<SharedState>,
    Path((app, id)): Path<(String, String)>,
) -> impl IntoResponse {
    let app_type = match AppType::from_str(&app) {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<bool>::error(e.to_string())),
            )
        }
    };

    match ProviderService::switch(&state, app_type, &id) {
        Ok(()) => (StatusCode::OK, Json(ApiResponse::success(true))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(e.to_string())),
        ),
    }
}
