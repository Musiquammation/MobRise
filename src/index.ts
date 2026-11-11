import "@fontsource/lilita-one/index.css";
import "./css/style.css";
import { App } from "./App";
import { DEBUG } from "./config";
import { DEBUG_ALLOWED } from "./env";
import { FpsCounter } from "./debug/FpsCounter";

if (DEBUG && DEBUG_ALLOWED) new FpsCounter();

const app = new App(document.querySelector("canvas")!);
app.boot().catch(err => {
	console.error(err);
	document.body.dataset.error = String(err);
});
