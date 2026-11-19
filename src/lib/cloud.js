// Sincronización opcional con Supabase a través de las APIs de Vercel.
// Sin variables de entorno la app sigue siendo 100 % local.

export const CLOUD_SYNC = import.meta.env.VITE_CLOUD_SYNC === "true";
const STORAGE_KEY = "acrodocs_demo_v7";
const APP_KEY = import.meta.env.VITE_APP_KEY || "";

const headers = () => ({
  "Content-Type": "application/json",
  ...(APP_KEY ? { "x-app-key": APP_KEY } : {}),
});

// Descarga el snapshot remoto y lo coloca en localStorage antes de renderizar.
// Si falla, se conserva el estado local y la app arranca igual.
export const pullCloudState = async () => {
  if (!CLOUD_SYNC) return false;
  try {
    const res = await fetch("/api/state", { headers: headers() });
    if (!res.ok) return false;
    const json = await res.json();
    if (json?.data && typeof json.data === "object") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(json.data));
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

// Sube un snapshot. Lo llama store.js con debounce después de cada escritura.
export const pushCloudState = async (data) => {
  if (!CLOUD_SYNC) return false;
  try {
    const res = await fetch("/api/state", {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ data }),
    });
    return res.ok;
  } catch {
    return false;
  }
};
