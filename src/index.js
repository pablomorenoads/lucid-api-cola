import { DurableObject } from "cloudflare:workers";

const TIEMPO_ESPERA = 12000; // 12 segundos

export class Mensajes extends DurableObject {

  async agregarYEsperar(mensaje) {

    let mensajes = (await this.ctx.storage.get("mensajes")) || [];

    // Guardamos el mensaje
    const idMensaje = Date.now();

    mensajes.push({
      id: idMensaje,
      mensaje: mensaje,
      fecha: new Date().toISOString()
    });

    await this.ctx.storage.put("mensajes", mensajes);

    // Reiniciamos la alarma
    await this.ctx.storage.setAlarm(Date.now() + TIEMPO_ESPERA);

    // Esperamos 12 segundos
    await new Promise(resolve =>
      setTimeout(resolve, TIEMPO_ESPERA)
    );

    // Volvemos a leer los mensajes
    mensajes = (await this.ctx.storage.get("mensajes")) || [];

    // El último mensaje actualmente guardado
    const ultimoMensaje = mensajes[mensajes.length - 1];

    // Si llegó otro mensaje después de este,
    // esta ejecución NO debe responder.
    if (!ultimoMensaje || ultimoMensaje.id !== idMensaje) {

      return {
        responder: false,
        mensajes: []
      };
    }

    // Esta es la última ejecución.
    // Puede responder con toda la conversación agrupada.
    const texto = mensajes
      .map(item => item.mensaje)
      .join(" | ");

    return {
      responder: true,
      mensajes: mensajes,
      respuesta: texto
    };
  }

  async obtenerRespuesta() {
    return await this.ctx.storage.get("respuesta_lista") || null;
  }

  async estado() {
    const mensajes = (await this.ctx.storage.get("mensajes")) || [];
    const alarma = await this.ctx.storage.getAlarm();

    return {
      mensajes,
      alarma,
      segundos_restantes: alarma
        ? Math.max(0, Math.round((alarma - Date.now()) / 1000))
        : null
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
    const modo = url.searchParams.get("modo");

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

    // NUEVO MODO:
    // recibe el mensaje, espera 12 segundos
    // y determina si esta ejecución debe responder.
    if (modo === "esperar") {

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

      const resultado = await stub.agregarYEsperar(mensaje);

      return new Response(
        JSON.stringify(resultado),
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // Consultar respuesta anterior
    if (modo === "respuesta") {

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

    // Consultar estado
    if (modo === "estado") {

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

    return new Response(
      JSON.stringify({
        error: "Modo no especificado"
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
};
