use napi::Result;
use napi_derive::napi;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeEnvelope {
    core: CoreKind,
    op: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
enum CoreKind {
    Event,
    Patch,
    Queue,
    Search,
    Transcript,
    Ui,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeOutput {
    value: serde_json::Value,
}

#[napi]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}

#[napi]
pub fn execute(operation_json: String) -> Result<String> {
    execute_json(&operation_json).map_err(to_napi_error)
}

#[napi]
pub fn execute_batch(operations_json: String) -> Result<String> {
    let operations: Vec<NativeEnvelope> =
        serde_json::from_str(&operations_json).map_err(to_napi_error)?;
    let mut outputs = Vec::with_capacity(operations.len());
    for operation in operations {
        outputs.push(execute_envelope(operation).map_err(to_napi_error)?);
    }
    serde_json::to_string(&outputs).map_err(to_napi_error)
}

fn execute_json(operation_json: &str) -> std::result::Result<String, serde_json::Error> {
    let envelope = serde_json::from_str::<NativeEnvelope>(operation_json)?;
    serde_json::to_string(&execute_envelope(envelope)?)
}

fn execute_envelope(
    envelope: NativeEnvelope,
) -> std::result::Result<NativeOutput, serde_json::Error> {
    let value = match envelope.core {
        CoreKind::Event => {
            let operation = serde_json::from_value::<pi_event_core::Operation>(envelope.op)?;
            serde_json::to_value(pi_event_core::execute(operation))?
        }
        CoreKind::Patch => {
            let operation = serde_json::from_value::<pi_patch_engine::Operation>(envelope.op)?;
            serde_json::to_value(pi_patch_engine::execute(operation))?
        }
        CoreKind::Queue => {
            let operation = serde_json::from_value::<pi_queue_core::Operation>(envelope.op)?;
            serde_json::to_value(pi_queue_core::execute(operation))?
        }
        CoreKind::Search => {
            let operation = serde_json::from_value::<pi_search_core::Operation>(envelope.op)?;
            serde_json::to_value(pi_search_core::execute(operation))?
        }
        CoreKind::Transcript => {
            let operation = serde_json::from_value::<pi_transcript_core::Operation>(envelope.op)?;
            serde_json::to_value(pi_transcript_core::execute(operation))?
        }
        CoreKind::Ui => {
            let operation = serde_json::from_value::<pi_ui_core::Operation>(envelope.op)?;
            serde_json::to_value(pi_ui_core::execute(operation))?
        }
    };
    let value = value
        .get("value")
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    Ok(NativeOutput { value })
}

fn to_napi_error(error: serde_json::Error) -> napi::Error {
    napi::Error::from_reason(error.to_string())
}
