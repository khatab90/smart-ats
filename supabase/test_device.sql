-- OPTIONAL — test environment only.
-- Registers one board flagged environment = 'test'. Production builds never
-- list or accept it. Copy the returned token into the emulator and keep the
-- PIN to add the board from a test build (VITE_APP_ENV=test).
select public.register_device('ATS-TEST01', 'test');
