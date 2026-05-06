use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde::{Deserialize, Serialize};
use tokio::io::{self, AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{Mutex, mpsc, oneshot};
use tokio::time;
use tracing::{error, warn};

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum Request {
    #[serde(rename_all = "camelCase")]
    Run {
        id: String,
        mode: RunMode,
        command: String,
        #[serde(default)]
        args: Vec<String>,
        cwd: Option<String>,
        env: Option<HashMap<String, String>>,
        timeout: Option<u64>,
    },
    Abort {
        id: String,
    },
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
enum RunMode {
    Shell,
    Process,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum Response {
    Start {
        id: String,
        command: String,
        cwd: Option<String>,
    },
    Stdout {
        id: String,
        chunk: String,
    },
    Stderr {
        id: String,
        chunk: String,
    },
    Exit {
        id: String,
        #[serde(rename = "exitCode")]
        exit_code: Option<i32>,
        #[serde(rename = "timedOut")]
        timed_out: bool,
        aborted: bool,
        killed: bool,
    },
    Error {
        id: String,
        message: String,
    },
}

type Sender = mpsc::UnboundedSender<Response>;
type Registry = Arc<Mutex<HashMap<String, Running>>>;

#[derive(Debug)]
struct Running {
    abort: oneshot::Sender<()>,
}

#[tokio::main]
async fn main() {
    init_tracing();

    let (tx, rx) = mpsc::unbounded_channel();
    let registry = Arc::new(Mutex::new(HashMap::new()));

    let writer = tokio::spawn(write_responses(rx));
    read_requests(tx, registry).await;

    if let Err(err) = writer.await {
        error!(?err, "response writer task failed");
    }
}

fn init_tracing() {
    let filter =
        tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "warn".into());
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .without_time()
        .init();
}

async fn read_requests(tx: Sender, registry: Registry) {
    let stdin = BufReader::new(io::stdin());
    let mut lines = stdin.lines();

    loop {
        match lines.next_line().await {
            Ok(Some(line)) => handle_line(line, tx.clone(), registry.clone()).await,
            Ok(None) => break,
            Err(err) => {
                error!(?err, "failed to read request line");
                break;
            }
        }
    }

    loop {
        if registry.lock().await.is_empty() {
            break;
        }
        time::sleep(Duration::from_millis(10)).await;
    }
}

async fn handle_line(line: String, tx: Sender, registry: Registry) {
    let request = match serde_json::from_str::<Request>(&line) {
        Ok(request) => request,
        Err(err) => {
            if let Some(id) = extract_id(&line) {
                send(
                    &tx,
                    Response::Error {
                        id,
                        message: err.to_string(),
                    },
                );
            } else {
                warn!(?err, "ignored malformed request without id");
            }
            return;
        }
    };

    match request {
        Request::Run {
            id,
            mode,
            command,
            args,
            cwd,
            env,
            timeout,
        } => {
            if registry.lock().await.contains_key(&id) {
                send(
                    &tx,
                    Response::Error {
                        id,
                        message: "execution id is already running".to_owned(),
                    },
                );
                return;
            }

            let (abort_tx, abort_rx) = oneshot::channel();
            let run_id = id.clone();
            tokio::spawn(run_command(
                run_id.clone(),
                mode,
                command,
                args,
                cwd,
                env,
                timeout,
                abort_rx,
                tx.clone(),
                registry.clone(),
            ));
            registry
                .lock()
                .await
                .insert(run_id, Running { abort: abort_tx });
        }
        Request::Abort { id } => {
            if let Some(running) = registry.lock().await.remove(&id) {
                let _ = running.abort.send(());
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn run_command(
    id: String,
    mode: RunMode,
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    timeout_ms: Option<u64>,
    mut abort_rx: oneshot::Receiver<()>,
    tx: Sender,
    registry: Registry,
) {
    send(
        &tx,
        Response::Start {
            id: id.clone(),
            command: display_command(mode, &command, &args),
            cwd: cwd.clone(),
        },
    );

    if let Some(cwd) = cwd.as_deref()
        && !Path::new(cwd).exists()
    {
        send(
            &tx,
            Response::Error {
                id: id.clone(),
                message: format!("Working directory does not exist: {cwd}"),
            },
        );
        registry.lock().await.remove(&id);
        return;
    }

    let mut child = match build_command(mode, &command, &args, cwd.as_deref(), env).spawn() {
        Ok(child) => child,
        Err(err) => {
            send(
                &tx,
                Response::Error {
                    id: id.clone(),
                    message: err.to_string(),
                },
            );
            registry.lock().await.remove(&id);
            return;
        }
    };

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdout_task =
        stdout.map(|stream| tokio::spawn(stream_chunks(id.clone(), stream, true, tx.clone())));
    let stderr_task =
        stderr.map(|stream| tokio::spawn(stream_chunks(id.clone(), stream, false, tx.clone())));

    let mut timed_out = false;
    let mut aborted = false;
    let mut killed = false;
    let status = if let Some(timeout_ms) = timeout_ms.filter(|timeout| *timeout > 0) {
        tokio::select! {
            result = child.wait() => result,
            _ = time::sleep(Duration::from_millis(timeout_ms)) => {
                timed_out = true;
                killed = true;
                kill_process_tree(child.id()).await;
                child.wait().await
            }
            _ = &mut abort_rx => {
                aborted = true;
                killed = true;
                kill_process_tree(child.id()).await;
                child.wait().await
            }
        }
    } else {
        tokio::select! {
            result = child.wait() => result,
            _ = &mut abort_rx => {
                aborted = true;
                killed = true;
                kill_process_tree(child.id()).await;
                child.wait().await
            }
        }
    };

    if let Some(task) = stdout_task {
        let _ = task.await;
    }
    if let Some(task) = stderr_task {
        let _ = task.await;
    }

    match status {
        Ok(status) => send(
            &tx,
            Response::Exit {
                id: id.clone(),
                exit_code: status.code(),
                timed_out,
                aborted,
                killed,
            },
        ),
        Err(err) => send(
            &tx,
            Response::Error {
                id: id.clone(),
                message: err.to_string(),
            },
        ),
    }

    registry.lock().await.remove(&id);
}

fn build_command(
    mode: RunMode,
    command: &str,
    args: &[String],
    cwd: Option<&str>,
    env: Option<HashMap<String, String>>,
) -> Command {
    let mut cmd = match mode {
        RunMode::Shell => default_shell_command(command),
        RunMode::Process => {
            let mut cmd = Command::new(command);
            cmd.args(args);
            cmd
        }
    };

    if let Some(cwd) = cwd {
        cmd.current_dir(cwd);
    }
    if let Some(env) = env {
        cmd.envs(env);
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd
}

#[cfg(windows)]
fn default_shell_command(command: &str) -> Command {
    let shell = std::env::var_os("ComSpec").unwrap_or_else(|| "cmd.exe".into());
    let mut cmd = Command::new(shell);
    cmd.args(["/d", "/s", "/c", command]);
    cmd
}

#[cfg(not(windows))]
fn default_shell_command(command: &str) -> Command {
    let shell = std::env::var_os("SHELL").unwrap_or_else(|| "sh".into());
    let mut cmd = Command::new(shell);
    cmd.args(["-c", command]);
    cmd
}

fn display_command(mode: RunMode, command: &str, args: &[String]) -> String {
    match mode {
        RunMode::Shell => command.to_owned(),
        RunMode::Process if args.is_empty() => command.to_owned(),
        RunMode::Process => {
            let mut out = String::with_capacity(
                command.len() + args.iter().map(String::len).sum::<usize>() + args.len(),
            );
            out.push_str(command);
            for arg in args {
                out.push(' ');
                out.push_str(arg);
            }
            out
        }
    }
}

async fn kill_process_tree(pid: Option<u32>) {
    let Some(pid) = pid else {
        return;
    };

    #[cfg(windows)]
    {
        match Command::new("taskkill.exe")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .await
        {
            Ok(status) if status.success() => {}
            Ok(status) => warn!(pid, ?status, "taskkill returned non-zero status"),
            Err(err) => warn!(pid, ?err, "failed to run taskkill"),
        }
    }

    #[cfg(not(windows))]
    {
        if let Err(err) = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .await
        {
            warn!(pid, ?err, "failed to send SIGTERM");
        }
    }
}

async fn stream_chunks(id: String, mut stream: impl AsyncRead + Unpin, stdout: bool, tx: Sender) {
    let mut buffer = vec![0_u8; 16 * 1024];
    loop {
        match stream.read(&mut buffer).await {
            Ok(0) => break,
            Ok(read) => {
                let chunk = STANDARD.encode(&buffer[..read]);
                let response = if stdout {
                    Response::Stdout {
                        id: id.clone(),
                        chunk,
                    }
                } else {
                    Response::Stderr {
                        id: id.clone(),
                        chunk,
                    }
                };
                send(&tx, response);
            }
            Err(err) => {
                send(
                    &tx,
                    Response::Error {
                        id: id.clone(),
                        message: err.to_string(),
                    },
                );
                break;
            }
        }
    }
}

async fn write_responses(mut rx: mpsc::UnboundedReceiver<Response>) {
    let mut stdout = io::BufWriter::new(io::stdout());
    while let Some(response) = rx.recv().await {
        match serde_json::to_vec(&response) {
            Ok(mut line) => {
                line.push(b'\n');
                if stdout.write_all(&line).await.is_err() || stdout.flush().await.is_err() {
                    break;
                }
            }
            Err(err) => error!(?err, "failed to serialize sidecar response"),
        }
    }
}

fn send(tx: &Sender, response: Response) {
    let _ = tx.send(response);
}

fn extract_id(line: &str) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(line)
        .ok()
        .and_then(|value| {
            value
                .get("id")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
        })
}
