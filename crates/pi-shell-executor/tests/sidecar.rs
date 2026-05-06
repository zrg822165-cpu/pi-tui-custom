use std::io::Write;
use std::process::{Command, Stdio};
use std::time::Duration;

use serde_json::Value;

fn run_sidecar(input: &str) -> Vec<Value> {
    let mut child = Command::new(assert_cmd::cargo::cargo_bin!("pi-shell-executor"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn sidecar");

    child
        .stdin
        .as_mut()
        .expect("sidecar stdin")
        .write_all(input.as_bytes())
        .expect("write sidecar request");
    drop(child.stdin.take());

    let output = child.wait_with_output().expect("sidecar output");
    assert!(
        output.status.success(),
        "stderr={}",
        String::from_utf8_lossy(&output.stderr)
    );

    String::from_utf8(output.stdout)
        .expect("utf8 stdout")
        .lines()
        .map(|line| serde_json::from_str(line).expect("json response"))
        .collect()
}

#[test]
fn process_mode_streams_output_and_exit() {
    let request = serde_json::json!({
        "type": "run",
        "id": "t1",
        "mode": "process",
        "command": "cmd.exe",
        "args": ["/d", "/s", "/c", "echo hello"],
        "timeout": 5000
    });

    let responses = run_sidecar(&format!("{request}\n"));
    assert_eq!(responses[0]["type"], "start");
    assert!(responses.iter().any(|msg| msg["type"] == "stdout"));
    assert!(
        responses
            .iter()
            .any(|msg| msg["type"] == "exit" && msg["exitCode"] == 0)
    );
}

#[test]
fn missing_cwd_reports_error() {
    let request = serde_json::json!({
        "type": "run",
        "id": "cwd",
        "mode": "shell",
        "command": "echo never",
        "cwd": "Z:/this/path/should/not/exist/pi-tui-custom"
    });

    let responses = run_sidecar(&format!("{request}\n"));
    assert!(responses.iter().any(|msg| msg["type"] == "error"));
}

#[test]
fn timeout_marks_exit() {
    let request = serde_json::json!({
        "type": "run",
        "id": "timeout",
        "mode": "process",
        "command": "cmd.exe",
        "args": ["/d", "/s", "/c", "ping -n 6 127.0.0.1 > nul"],
        "timeout": 100
    });

    let start = std::time::Instant::now();
    let responses = run_sidecar(&format!("{request}\n"));
    assert!(start.elapsed() < Duration::from_secs(5));
    assert!(
        responses
            .iter()
            .any(|msg| msg["type"] == "exit" && msg["timedOut"] == true)
    );
}
