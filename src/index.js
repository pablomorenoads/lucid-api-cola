import { DurableObject } from "cloudflare:workers";

const TIEMPO_ESPERA = 15000; // 15 segundos

export class Mensajes extends DurableObject {

  async agregarYEsperar(mensaje) {

    let mensajes = (await this.ctx.storage.get("mensajes")) || [];

    // Identificador único para esta ejecución
    const idMensaje = Date.now();

    // Guardamos el mensaje
    mensajes.push({
      id: idMensaje,
      mensaje: mensaje,
      fecha: new Date().toISOString()
    });

    await this.ctx.storage.put("mensajes", mensajes);

    // Reiniciamos la alarma
    await this.ctx.storage.setAlarm(Date.now() + TIEMPO_ESPERA);

    // Esperamos 15 segundos
    await new Promise(resolve =>
      setTimeout(resolve, TIEMPO_ESPERA)
    );

    // Volvemos a leer la cola
    mensajes = (await this.ctx.storage.get("mensajes")) || [];

    // Último mensaje actualmente almacenado
    const ultimoMensaje = mensajes[mensajes.length - 1];

    // Si llegó otro mensaje después de este,
    // esta ejecución NO debe responder.
    if (!ultimoMensaje || ultimoMensaje.id !== idMensaje) {

      return {
        responder: false,
        mensajes: []
      };
    }

    // -----------------------------------------
    // ESTA ES LA ÚLTIMA EJECUCIÓN
    // -----------------------------------------

    // Guardamos una copia del grupo que vamos a responder
    const grupo = [...mensajes];

    // Construimos el texto agrupado
    const texto = grupo
      .map(item => item.mensaje)
      .join(" | ");

    // IMPORTANTE:
    // Eliminamos solamente los mensajes que pertenecen
    // al grupo que acabamos de procesar.
    //
    // Si mientras tanto apareció un mensaje nuevo,
    // se conserva.
    const mensajesNuevos = mensajes.filter(
      item => item.id > idMensaje
    );

    await this.ctx.storage.put(
      "mensajes",
      mensajesNuevos
    );

    // Limpiamos la respuesta anterior
    await this.ctx.storage.delete("respuesta_lista");

    // Guardamos la respuesta actual por si queremos
    // consultarla posteriormente
    await this.ctx.storage.put(
      "respuesta_lista",
      texto
    );

    // Ya no necesitamos la alarma de este grupo
    await this.ctx.storage.deleteAlarm();

    return {
      responder: true,
      mensajes: grupo,
      respuesta: texto
    };
  }

  async obtenerRespuesta() {

    return await this.ctx.storage.get(
      "respuesta_lista"
    ) || null;
  }

  async estado() {

    const mensajes =
      (await this.ctx.storage.get("mensajes")) || [];

    const alarma =
      await this.ctx.storage.getAlarm();

    return {
      mensajes,
      alarma,
      segundos_restantes: alarma
        ? Math.max(
            0,
            Math.round(
              (alarma - Date.now()) / 1000
            )
          )
        : null
    };
  }

  async alarm() {

    const mensajes =
      (await this.ctx.storage.get("mensajes")) || [];

    if (mensajes.length === 0) {
      return;
    }

    const texto = mensajes
      .map(
        (item, index) =>
          `${index + 1}. ${item.mensaje}`
      )
      .join(" | ");

    await this.ctx.storage.put(
      "respuesta_lista",
      texto
    );

    console.log(
      "RESPUESTA LISTA:",
      texto
    );
  }
}

export default {

  async fetch(request, env) {

    const url = new URL(request.url);

    const cliente =
      url.searchParams.get("cliente");

    const mensaje =
      url.searchParams.get("mensaje");

    const modo =
      url.searchParams.get("modo");

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

    // Cada cliente tiene su propia cola
    const id =
      env.MENSAJES.idFromName(cliente);

    const stub =
      env.MENSAJES.get(id);

    // -----------------------------------------
    // RECIBIR MENSAJE Y ESPERAR
    // -----------------------------------------

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

      const resultado =
        await stub.agregarYEsperar(mensaje);

      return new Response(
        JSON.stringify(resultado),
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // -----------------------------------------
    // CONSULTAR RESPUESTA
    // -----------------------------------------

    if (modo === "respuesta") {

      const respuesta =
        await stub.obtenerRespuesta();

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

    // -----------------------------------------
    // CONSULTAR ESTADO
    // -----------------------------------------

    if (modo === "estado") {

      const estado =
        await stub.estado();

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
