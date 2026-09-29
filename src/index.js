import { DurableObject } from "cloudflare:workers";

const TIEMPO_ESPERA = 12000; // 12 segundos

export class Mensajes extends DurableObject {

  async agregar(mensaje) {
    let mensajes = (await this.ctx.storage.get("mensajes")) || [];

    mensajes.push({
      mensaje: mensaje,
      fecha: new Date().toISOString()
    });

    await this.ctx.storage.put("mensajes", mensajes);

    // Reinicia el contador cada vez que llega un mensaje
    await this.ctx.storage.setAlarm(Date.now() + TIEMPO_ESPERA);

    return mensajes;
  }

  async obtenerRespuesta() {
    const respuesta = await this.ctx.storage.get("respuesta_lista");

    return respuesta || null;
  }

  async estado() {
    const mensajes = (await this.ctx.storage.get("mensajes")) || [];
    const alarma = await this.ctx.storage.getAlarm();
    const respuesta = await this.ctx.storage.get("respuesta_lista");

    return {
      mensajes,
      alarma,
      segundos_restantes: alarma
        ? Math.max(0, Math.round((alarma - Date.now()) / 1000))
        : null,
      respuesta_lista: respuesta || null
    };
  }

  async alarm() {
    const mensajes = (await this.ctx.storage.get("mensajes")) || [];

    const texto = mensajes
      .map((item, index) => `${index + 1}. ${item.mensaje}`)
      .join(" | ");

    await this.ctx.storage.put("respuesta_lista", texto);

    console.log("RESPUESTA LISTA:", texto);
  }
}

export default {
  async fetch(request, env) {

    const url = new URL(request.url);

    const cliente = url.searchParams.get("cliente");
    const mensaje = url.searchParams.get("mensaje");
    const consultar = url.searchParams.get("consultar");

    if (!cliente) {
      return new Response(
        JSON.stringify({
          error: "Falta cliente"
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const id = env.MENSAJES.idFromName(cliente);
    const stub = env.MENSAJES.get(id);

    // Consultar respuesta agrupada
    if (consultar === "respuesta") {

      const respuesta = await stub.obtenerRespuesta();

      return new Response(
        JSON.stringify({
          respuesta: respuesta
        }),
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // Consultar estado completo
    if (consultar === "1") {

      const estado = await stub.estado();

      return new Response(
        JSON.stringify(estado),
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    if (!mensaje) {
      return new Response(
        JSON.stringify({
          error: "Falta mensaje"
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const mensajes = await stub.agregar(mensaje);

    return new Response(
      JSON.stringify({
        cliente: cliente,
        cantidad: mensajes.length,
        mensaje_recibido: mensaje,
        espera_segundos: 12
      }),
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
};
