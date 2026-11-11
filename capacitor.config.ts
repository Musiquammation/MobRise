import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
	appId: "com.musiquammation.mobrise",
	appName: "MobRise",
	webDir: "dist",
	backgroundColor: "#8fd0f7",
	ios: {
		// The page handles the notch itself with env(safe-area-inset-*).
		contentInset: "never",
		// The game is a fixed full-screen canvas: no WebView bounce/scroll.
		scrollEnabled: false,
		backgroundColor: "#8fd0f7",
	},
};

export default config;
