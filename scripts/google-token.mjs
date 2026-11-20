// Obtiene el token de actualización de Google que usa el servidor para guardar archivos en Drive.
// Se ejecuta UNA vez en tu computadora (no en Vercel):   node scripts/google-token.mjs
// Pide el ID y el secreto del cliente OAuth (tipo «Aplicación de escritorio»), abre el enlace de
// consentimiento de Google y muestra el token SOLO en esta ventana. No se guarda en ningún archivo.
import http from "node:http";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";

const ALCANCE = "https://www.googleapis.com/auth/drive.file";

const preguntar = (texto, oculto = false) => new Promise((resolver) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Mientras se escribe el secreto no se muestran los caracteres (solo la pregunta).
  if (oculto) rl._writeToOutput = (s) => { if (s.includes(texto)) rl.output.write(s); };
  rl.question(texto, (respuesta) => {
    rl.close();
    if (oculto) process.stdout.write("\n");
    resolver(respuesta.trim());
  });
});

const abrir = (url) => {
  try {
    if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url.replace(/&/g, "^&")], { stdio: "ignore", detached: true }).unref();
    else spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { stdio: "ignore", detached: true }).unref();
  } catch { /* si no se pudo abrir, el enlace ya está en pantalla */ }
};

const clientId = await preguntar("ID de cliente (termina en .apps.googleusercontent.com): ");
const clientSecret = await preguntar("Secreto del cliente (no se verá al escribir): ", true);
if (!clientId || !clientSecret) {
  console.error("Faltan datos. Vuelve a ejecutar el comando.");
  process.exit(1);
}

const estado = randomBytes(16).toString("hex");
let redirigir;
const servidor = http.createServer(async (req, res) => {
  const direccion = new URL(req.url, "http://127.0.0.1");
  if (direccion.pathname !== "/") { res.writeHead(404).end(); return; }
  const codigo = direccion.searchParams.get("code");
  const fallo = direccion.searchParams.get("error");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  if (fallo || !codigo || direccion.searchParams.get("state") !== estado) {
    res.end("<h3>No se pudo autorizar. Vuelve a la ventana de comandos.</h3>");
    console.error(`\nGoogle no autorizó la conexión${fallo ? ` (${fallo})` : ""}. Vuelve a ejecutar el comando.`);
    servidor.close();
    process.exit(1);
  }
  res.end("<h3>Listo. Ya puedes cerrar esta pestaña y volver a la ventana de comandos.</h3>");
  const respuesta = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: codigo, client_id: clientId, client_secret: clientSecret, redirect_uri: redirigir, grant_type: "authorization_code" }),
  });
  const json = await respuesta.json().catch(() => ({}));
  servidor.close();
  if (!respuesta.ok || !json.refresh_token) {
    console.error(`\nGoogle no entregó el token (${json.error || respuesta.status}). ${json.error_description || ""}`);
    console.error("Si ya habías autorizado antes, entra a https://myaccount.google.com/permissions, quita AcroDocs y repite.");
    process.exit(1);
  }
  console.log("\n✔ Listo. Este es tu GOOGLE_REFRESH_TOKEN (cópialo y pégalo tú en Vercel como variable Sensitive; no lo compartas):\n");
  console.log(json.refresh_token);
  console.log("\nAlcance concedido:", json.scope);
  process.exit(0);
});

servidor.listen(0, "127.0.0.1", () => {
  redirigir = `http://127.0.0.1:${servidor.address().port}`;
  const enlace = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: clientId, redirect_uri: redirigir, response_type: "code", scope: ALCANCE,
    access_type: "offline", prompt: "consent", state: estado,
  })}`;
  console.log("\nSe abrirá el navegador para que autorices el acceso con tu cuenta de Google.");
  console.log("Si no se abre, copia este enlace en el navegador:\n");
  console.log(enlace, "\n");
  abrir(enlace);
});
