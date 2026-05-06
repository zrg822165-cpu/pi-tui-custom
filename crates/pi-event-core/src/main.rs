use std::io::{self, Read};

use pi_event_core::{Operation, execute};

fn main() {
    let mut input = String::new();
    if let Err(err) = io::stdin().read_to_string(&mut input) {
        eprintln!("failed to read stdin: {err}");
        std::process::exit(1);
    }
    let operation = match serde_json::from_str::<Operation>(&input) {
        Ok(operation) => operation,
        Err(err) => {
            eprintln!("failed to parse operation: {err}");
            std::process::exit(1);
        }
    };
    match serde_json::to_string(&execute(operation)) {
        Ok(output) => println!("{output}"),
        Err(err) => {
            eprintln!("failed to serialize result: {err}");
            std::process::exit(1);
        }
    }
}
