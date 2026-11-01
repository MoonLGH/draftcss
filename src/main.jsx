import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./hero-art.css";
import "./obs.css";
import "./splash-review.css";
import "./training.css";

const pagePath = window.location.pathname.replace(/\/$/, "");
if (pagePath === "/obs") document.body.classList.add("obs-body");
if (pagePath === "/seeallsplash") document.body.classList.add("splash-review-body");

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
