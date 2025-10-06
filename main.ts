// main.ts - Финальная каноническая версия с Deno.createHttpClient

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

// --- СОЗДАЕМ КЛИЕНТ, КОТОРЫЙ ИГНОРИРУЕТ ОШИБКИ SSL ---
// Это самый надежный способ. Игнорируем ошибки редактора, если они есть.
const unsafeClient = Deno.createHttpClient({
  unsafelyIgnoreCertificateErrors: true,
});

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
    // Применяем наш клиент к запросу токена
    client: unsafeClient, 
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

// --- ОСНОВНАЯ ЛОГИКА СЕРВЕРА ---
async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
  }
  if (!GIGA_AUTH_CREDENTIALS || !PROXY_SECRET_KEY) {
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
      // Применяем наш клиент и к запросу чата
      client: unsafeClient,
    });
    if (!gigaResponse.ok) {
      const errorText = await gigaResponse.text();
      return new Response(errorText, { status: gigaResponse.status });
    }
    const responseData = await gigaResponse.json();
    return new Response(JSON.stringify(responseData), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  // deno-lint-ignore no-explicit-any
  } catch (error: any) {
    return new Response(error.message, { status: 500 });
  }
}

// --- ЗАПУСК СЕРВЕРА ---
console.log("Starting server...");
Deno.serve(handler);