import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./hero-art.css";
import "./obs.css";

if (window.location.pathname.replace(/\/$/, "") === "/obs") document.body.classList.add("obs-body");

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
