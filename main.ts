// main.ts - Финальная версия с использованием Deno.serve

// Мы больше НЕ ИСПОЛЬЗУЕМ старую библиотеку 'serve'.

// --- КОНФИГУРАЦИЯ GIGACHAT ---
const GIGA_TOKEN_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const GIGA_API_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions";

// --- ПОЛУЧАЕМ СЕКРЕТЫ ИЗ ОКРУЖЕНИЯ ---
const GIGA_AUTH_CREDENTIALS = Deno.env.get("GIGA_AUTH_CREDENTIALS");
const PROXY_SECRET_KEY = Deno.env.get("PROXY_SECRET_KEY");
const GIGA_SCOPE = "GIGACHAT_API_PERS";

// --- УПРАВЛЕНИЕ ВРЕМЕННЫМ ТОКЕНОМ ---
let accessToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt) {
    return accessToken;
  }
  console.log("Requesting new GigaChat access token...");
  const response = await fetch(GIGA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${GIGA_AUTH_CREDENTIALS}`,
      "RqUID": crypto.randomUUID(),
    },
    body: `scope=${GIGA_SCOPE}`,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get access token: ${errorText}`);
  }
  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in * 1000) - 60000;
  console.log("Successfully received new access token.");
  return accessToken;
}

// --- ОСНОВНОЙ СЕРВЕР ---
const unsafeClient = Deno.createHttpClient({
  unsafelyIgnoreCertificateErrors: true,
});

// Наша основная логика, которая будет обрабатывать каждый запрос
async function handler(req: Request): Promise<Response> {
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
  if (!GIGA_AUTH_CREDENTIALS || !PROXY_SECRET_KEY) {
    console.error("Server configuration error: Secrets are not set.");
    return new Response("Server configuration error.", { status: 500 });
  }
  if (req.method !== 'POST' || req.headers.get("Authorization") !== `Bearer ${PROXY_SECRET_KEY}`) {
    return new Response("Unauthorized.", { status: 401 });
  }
  try {
    const token = await getAccessToken();
    const requestBody = await req.json();
    const gigaResponse = await fetch(GIGA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
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
}

// --- ЗАПУСК СЕРВЕРА ---
// Новый, правильный и современный способ запуска сервера в Deno
console.log("Starting server...");
Deno.serve(handler);