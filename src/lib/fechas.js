// Utilidades de fechas del expediente. Todas trabajan con cadenas ISO
// (YYYY-MM-DD) y no guardan estado: los feriados se pasan siempre como
// argumento (en la app salen de `data.feriados` del store).

export const FERIADOS_2026 = [
  "2026-01-01", "2026-01-02", "2026-04-02", "2026-04-03", "2026-05-01",
  "2026-06-07", "2026-06-29", "2026-07-23", "2026-07-28", "2026-07-29",
  "2026-08-06", "2026-08-30", "2026-10-08", "2026-11-01", "2026-12-08",
  "2026-12-09", "2026-12-25",
];

export const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const sumarDias = (fecha, dias) => {
  if (!fecha) return "";
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + Number(dias || 0));
  return d.toISOString().slice(0, 10);
};

export const esHabil = (fecha, feriados) => {
  if (!fecha) return false;
  const d = new Date(`${fecha}T12:00:00`);
  const dia = d.getDay();
  return dia !== 0 && dia !== 6 && !feriados.includes(fecha);
};

// Suma (o resta, si `dias` es negativo) días hábiles: no cuenta sábados,
// domingos ni feriados.
export const sumarHabiles = (fecha, dias, feriados) => {
  if (!fecha) return "";
  const d = new Date(`${fecha}T12:00:00`);
  let n = Number(dias) || 0;
  const paso = n >= 0 ? 1 : -1;
  n = Math.abs(n);
  while (n > 0) {
    d.setDate(d.getDate() + paso);
    if (esHabil(d.toISOString().slice(0, 10), feriados)) n -= 1;
  }
  return d.toISOString().slice(0, 10);
};

// Saludo del Panel: de 5 a 11 días, de 12 a 18 tardes y el resto noches.
export const saludoPorHora = (hora) => {
  if (hora >= 5 && hora < 12) return "Buenos días";
  if (hora >= 12 && hora < 19) return "Buenas tardes";
  return "Buenas noches";
};

export const diasEntre = (a, b) => {
  if (!a || !b) return 0;
  const d1 = new Date(`${a}T12:00:00`);
  const d2 = new Date(`${b}T12:00:00`);
  return Math.round((d2 - d1) / 86400000);
};
