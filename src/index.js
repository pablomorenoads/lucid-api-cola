import { DurableObject } from "cloudflare:workers";

export class Mensajes extends DurableObject {
  async agregar(mensaje) {
    let mensajes = (await this.ctx.storage.get("mensajes")) || [];

    mensajes.push({
      mensaje: mensaje,
      fecha: new Date().toISOString()
    });

    await this.ctx.storage.put("mensajes", mensajes);

    return mensajes;
  }

  async obtener() {
    return (await this.ctx.storage.get("mensajes")) || [];
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const cliente = url.searchParams.get("cliente");
    const mensaje = url.searchParams.get("mensaje");

    if (!cliente || !mensaje) {
      return new Response(
        JSON.stringify({
          error: "Falta cliente o mensaje"
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

    const mensajes = await stub.agregar(mensaje);

    return new Response(
      JSON.stringify({
        cliente: cliente,
        cantidad: mensajes.length,
        mensajes: mensajes
      }),
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
};
