import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

/**
 * Handles the Android back button (gesture or key).
 * Returns true when the game consumed it; false lets the app close.
 */
export type BackHandler = () => boolean;

/**
 * Routes the hardware back button to `handler`. No-op outside Android.
 * Without a listener Capacitor would navigate the WebView history / quit.
 */
export function listenBackButton(handler: BackHandler) {
	if (Capacitor.getPlatform() !== "android") return;
	void App.addListener("backButton", () => {
		if (!handler()) void App.exitApp();
	});
}
