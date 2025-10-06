// main.ts - Код для прокси на Deno Deploy

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const GIGA_API_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions";
const GIGA_API_KEY = Deno.env.get("GIGA_API_KEY");
const PROXY_SECRET_KEY = Deno.env.get("PROXY_SECRET_KEY");

const unsafeClient = Deno.createHttpClient({
  unsafelyIgnoreCertificateErrors: true,
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (!GIGA_API_KEY || !PROXY_SECRET_KEY) {
    console.error("Server configuration error: Secrets are not set.");
    return new Response("Server configuration error.", { status: 500 });
  }
  
  if (req.method !== 'POST' || req.headers.get("Authorization") !== `Bearer ${PROXY_SECRET_KEY}`) {
    return new Response("Unauthorized.", { status: 401 });
  }

  try {
    const requestBody = await req.json();
    const gigaResponse = await fetch(GIGA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GIGA_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
      client: unsafeClient,
    });

    if (!gigaResponse.ok) {
      const errorText = await gigaResponse.text();
      console.error("GigaChat API Error:", errorText);
      return new Response(errorText, { status: gigaResponse.status });
    }

    const responseData = await gigaResponse.json();
    return new Response(JSON.stringify(responseData), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  // deno-lint-ignore no-explicit-any
  } catch (error: any) { 
    console.error("Proxy internal error:", error);
    return new Response(error.message, { status: 500 });
  }
});