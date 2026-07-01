import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initTheme } from "./lib/theme";
import { initSentry } from "./lib/sentry";
import { setBaseUrl } from "@workspace/api-client-react";

initSentry();

const apiUrl = import.meta.env.VITE_API_URL;
if (apiUrl) {
  setBaseUrl(apiUrl);
}

initTheme();
createRoot(document.getElementById("root")!).render(<App />);
