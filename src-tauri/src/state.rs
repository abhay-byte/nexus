use portable_pty::{Child, MasterPty};
use std::{
    collections::HashMap,
    io::Write,
    sync::{Arc, Mutex},
};
use sysinfo::System;

pub struct PtySession {
    pub writer: Mutex<Box<dyn Write + Send>>,
    pub master: Mutex<Box<dyn MasterPty + Send>>,
    pub child: Mutex<Box<dyn Child + Send>>,
}

impl PtySession {
    pub fn new(
        writer: Box<dyn Write + Send>,
        master: Box<dyn MasterPty + Send>,
        child: Box<dyn Child + Send>,
    ) -> Self {
        Self {
            writer: Mutex::new(writer),
            master: Mutex::new(master),
            child: Mutex::new(child),
        }
    }
}

pub struct AppState {
    pub sessions: Mutex<HashMap<String, Arc<PtySession>>>,
    pub sys: Mutex<System>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            sys: Mutex::new(System::new_all()),
        }
    }
}
