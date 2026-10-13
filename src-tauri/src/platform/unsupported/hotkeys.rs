/// No global hotkeys on this platform.
pub struct HotkeyManager;

impl HotkeyManager {
    pub const HOTKEY_RELOAD: i32 = 1;
    pub const HOTKEY_TOGGLE: i32 = 2;
    pub const HOTKEY_LOCK: i32 = 3;

    pub fn rebind(_: i32, _: u32, _: u32) {}
    pub fn new() -> Self {
        Self
    }
    #[allow(clippy::too_many_arguments)]
    pub fn start(
        &self,
        _: u32,
        _: u32,
        _: u32,
        _: u32,
        _: u32,
        _: u32,
        _: impl Fn() + Send + 'static,
        _: impl Fn() + Send + 'static,
        _: impl Fn() + Send + 'static,
    ) {
    }
    pub fn stop(&self) {}
}
