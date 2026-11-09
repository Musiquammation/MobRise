import "./css/style.css";
import { App } from "./App";

const app = new App(document.querySelector("canvas")!);
app.boot().catch(err => {
	console.error(err);
	document.body.dataset.error = String(err);
});
