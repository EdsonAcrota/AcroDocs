// Reduce las fotos del celular antes de guardarlas. Una foto de cámara pesa 3–8 MB y al decodificarla
// ocupa decenas de MB de memoria; en teléfonos modestos eso termina en «Memoria insuficiente».
// Aquí se baja a un lado mayor de 1600 px y se guarda como JPEG, y si aun así pesa más de 2 MB se
// baja la calidad y, si hace falta, el tamaño, hasta que quepa: el resultado nunca pasa de 2 MB.

export const LADO_MAXIMO = 1600;
export const PESO_MAXIMO = 2 * 1024 * 1024;
const CALIDADES = [0.82, 0.7, 0.58, 0.45];
const RONDAS = 4; // cada ronda que sigue pesando de más achica la foto un 20 %

// Tamaño final que conserva la proporción y deja el lado mayor en `maximo` como mucho.
export const escalarA = (ancho, alto, maximo = LADO_MAXIMO) => {
  const mayor = Math.max(ancho, alto);
  if (!(mayor > maximo)) return { ancho, alto };
  const factor = maximo / mayor;
  return { ancho: Math.max(1, Math.round(ancho * factor)), alto: Math.max(1, Math.round(alto * factor)) };
};

// Lee solo las medidas (el navegador las saca de la cabecera del JPEG, sin decodificar toda la foto).
const medir = (archivo) => new Promise((resolver, rechazar) => {
  const url = URL.createObjectURL(archivo);
  const imagen = new Image();
  imagen.onload = () => resolver({ imagen, url });
  imagen.onerror = () => { URL.revokeObjectURL(url); rechazar(new Error("No se pudo leer la imagen.")); };
  imagen.src = url;
});

// Decodifica ya a la medida final cuando el navegador lo permite (menos memoria); si no, dibuja la imagen.
const dibujable = async (archivo, imagen, medida) => {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(archivo, {
        resizeWidth: medida.ancho, resizeHeight: medida.alto, resizeQuality: "medium", imageOrientation: "from-image",
      });
    } catch { /* navegador sin esas opciones: se usa la imagen tal cual */ }
  }
  return imagen;
};

const lienzoCon = (fuente, ancho, alto) => {
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const contexto = lienzo.getContext("2d");
  if (!contexto) return null;
  contexto.drawImage(fuente, 0, 0, ancho, alto);
  return lienzo;
};

const liberar = (lienzo) => {
  lienzo.width = 0;
  lienzo.height = 0;
};

const codificar = (lienzo, calidad) => new Promise((resolver) => lienzo.toBlob(resolver, "image/jpeg", calidad));

// Devuelve el mismo archivo si no es una foto JPEG, si ya es liviana o si algo falla: nunca impide subir.
export const reducirFoto = async (archivo, { pesoMaximo = PESO_MAXIMO } = {}) => {
  if (!archivo || !/^image\/jpe?g$/i.test(archivo.type || "")) return archivo;
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return archivo;
  let leida = null;
  try {
    leida = await medir(archivo);
    const { naturalWidth: ancho, naturalHeight: alto } = leida.imagen;
    if (!ancho || !alto) return archivo;
    const medida = escalarA(ancho, alto);
    if (medida.ancho === ancho && medida.alto === alto && archivo.size <= pesoMaximo) return archivo;

    const fuente = await dibujable(archivo, leida.imagen, medida);
    let lienzo = lienzoCon(fuente, medida.ancho, medida.alto);
    fuente.close?.();
    if (!lienzo) return archivo;

    let blob = null;
    for (let ronda = 0; ronda < RONDAS; ronda += 1) {
      for (const calidad of CALIDADES) {
        blob = await codificar(lienzo, calidad);
        if (!blob || blob.size <= pesoMaximo) break;
      }
      if (!blob || blob.size <= pesoMaximo) break;
      const menor = lienzoCon(lienzo, Math.max(1, Math.round(lienzo.width * 0.8)), Math.max(1, Math.round(lienzo.height * 0.8)));
      liberar(lienzo);
      if (!menor) return archivo;
      lienzo = menor;
    }
    liberar(lienzo);
    if (!blob || blob.size >= archivo.size) return archivo;
    return new File([blob], archivo.name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return archivo;
  } finally {
    if (leida) {
      leida.imagen.src = "";
      URL.revokeObjectURL(leida.url);
    }
  }
};
