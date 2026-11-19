import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { pullCloudState } from "./lib/cloud.js";
import "./styles.css";

const render = () =>
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );

// En modo nube se intenta recuperar el snapshot remoto antes de arrancar.
// Si no hay configuración o falla, la app usa el estado local sin interrumpirse.
pullCloudState().finally(render);
