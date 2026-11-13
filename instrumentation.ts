import { appMode } from "@/lib/mode";

// Runs once when the server starts, so a missing or invalid mode stops the app
// before it serves anything.
export function register() {
  appMode();
}
