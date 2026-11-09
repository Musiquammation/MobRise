import "./css/style.css";
import { App } from "./App";
import { DEBUG } from "./config";
import { FpsCounter } from "./debug/FpsCounter";

if (DEBUG) new FpsCounter();

const app = new App(document.querySelector("canvas")!);
app.boot().catch(err => {
	console.error(err);
	document.body.dataset.error = String(err);
});
