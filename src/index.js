import { DurableObject } from "cloudflare:workers";

export class Mensajes extends DurableObject {
  async prueba() {
    return "DURABLE OBJECT FUNCIONANDO";
  }
}

export default {
  async fetch(request, env) {
    const id = env.MENSAJES.idFromName("prueba");
    const stub = env.MENSAJES.get(id);

    const respuesta = await stub.prueba();

    return new Response(respuesta);
  }
};
