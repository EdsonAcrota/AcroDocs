import React from "react";
import CargosPanel from "../components/CargosPanel.jsx";

export default function MesaPartes() {
  return (
    <div>
      <div className="vista-encabezado">
        <div>
          <div className="eyebrow">Mesa de partes</div>
          <h2>Cargos de recepción</h2>
          <p>Número y fecha de recepción de cada documento presentado ante la entidad. Por defecto se muestran los de hoy.</p>
        </div>
      </div>
      <CargosPanel />
    </div>
  );
}
