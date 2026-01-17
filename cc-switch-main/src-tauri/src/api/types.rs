//! API 请求/响应数据结构

use serde::{Deserialize, Serialize};

use crate::provider::Provider;

/// API 通用响应
#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(message: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message.into()),
        }
    }
}

/// 获取提供商列表响应
#[derive(Debug, Serialize)]
pub struct ProvidersResponse {
    pub providers: indexmap::IndexMap<String, Provider>,
    pub current: Option<String>,
}

/// 添加/更新提供商请求
#[derive(Debug, Deserialize)]
pub struct ProviderRequest {
    pub app: String,
    pub provider: Provider,
}

/// 健康检查响应
#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
}
